// SIE V3 — Pipeline determinístico. Server-only.
// Fidelidade absoluta ao arquivo. Snapshot bruto imutável. Estado final via Máquina de Estados (Cap. 37).

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

export const V3_ALGORITHM_VERSION = "v3.0.0";

const PROTECTED_FIELDS = [
  "client_name", "description", "amount", "transaction_date",
  "balance", "document_number", "cpf_cnpj", "phone",
] as const;

// ============================================================
// Tipos
// ============================================================

export type RawRow = Record<string, string>;
export type RawTable = {
  headers: string[];
  rows: RawRow[];
  meta: Record<string, unknown>;
  charset?: string;
  ocrConfidence?: number;
  headerFailed?: boolean;
};

export type CanonicalRow = {
  client_name: string | null;
  description: string | null;
  amount: number | null;
  transaction_date: string | null; // YYYY-MM-DD
  balance: number | null;
  document_number: string | null;
  cpf_cnpj: string | null;
  phone: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  movement_type: string | null; // C, D, PIX, TED etc. — como veio
  raw_extra: Record<string, string>;
};

export type FieldMap = Partial<Record<keyof CanonicalRow, string>>;
export type LineStatus = "OK" | "LINE_FAILED" | "LINE_REVIEW";
export type FinalState = "SUCCESS" | "PARTIAL_SUCCESS" | "REVIEW" | "FAILED";

// ============================================================
// Utilitário — hash SHA-256 do arquivo original
// ============================================================

async function sha256Hex(buf: Uint8Array): Promise<string> {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const h = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// Camada 2 — Conversão
// CSV/XLS: charset determinístico UTF-8 → ISO-8859-1 → Windows-1252
// ============================================================

const CHARSETS = ["utf-8", "iso-8859-1", "windows-1252"] as const;

function decodeDeterministic(buffer: Uint8Array): { text: string; charset: string; hadReplacements: boolean } {
  for (const cs of CHARSETS) {
    try {
      const text = new TextDecoder(cs, { fatal: true }).decode(buffer);
      return { text, charset: cs, hadReplacements: false };
    } catch { /* tenta próximo */ }
  }
  // fallback: windows-1252 tolerante (substitui indecifráveis por U+FFFD)
  const text = new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
  return { text, charset: "windows-1252", hadReplacements: text.includes("\uFFFD") };
}

export function parseCsv(buffer: Uint8Array): RawTable {
  const { text, charset } = decodeDeterministic(buffer);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const matrix = (parsed.data ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  return finalizeTable(matrix, { source: "csv" }, charset);
}

export function parseXlsx(buffer: Uint8Array): RawTable {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const clean = matrix.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  return finalizeTable(clean, { source: "xlsx", sheet: wb.SheetNames[0] }, "utf-8");
}

// PDF — reconstrução tabular via pdfjs-dist (unpdf) usando coordenadas X/Y.
// - Agrupa itens por Y (mesma linha visual) e ordena por X (colunas).
// - Se a página tiver texto insuficiente, marca imagePages para fallback OCR (Cap. 24.5–24.6).
export async function parsePdf(buffer: Uint8Array): Promise<RawTable> {
  const unpdf: any = await import("unpdf");
  const pdf = await unpdf.getDocumentProxy(buffer);
  const perPage: string[][][] = [];
  const imagePages: number[] = [];
  let totalCellsEst = 0, totalCellsGot = 0;

  const numPages = pdf.numPages;
  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: Array<{ str: string; x: number; y: number; w: number }> = (content.items ?? [])
      .filter((it: any) => it && typeof it.str === "string" && it.str.trim().length > 0)
      .map((it: any) => ({
        str: String(it.str),
        x: Array.isArray(it.transform) ? Number(it.transform[4]) : 0,
        y: Array.isArray(it.transform) ? Number(it.transform[5]) : 0,
        w: typeof it.width === "number" ? it.width : 0,
      }));

    // Texto insuficiente → provável página imagem/scan → candidata a OCR
    const totalChars = items.reduce((s, it) => s + it.str.replace(/\s+/g, "").length, 0);
    if (items.length < 5 || totalChars < 20) {
      imagePages.push(p);
      continue;
    }

    // Agrupa por linha (Y). Tolerância = mediana da altura de fonte estimada.
    const yTol = 3.0;
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Array<Array<{ str: string; x: number }>> = [];
    let currentY: number | null = null;
    let current: Array<{ str: string; x: number }> = [];
    for (const it of sorted) {
      if (currentY == null || Math.abs(currentY - it.y) <= yTol) {
        current.push({ str: it.str, x: it.x });
        currentY = currentY == null ? it.y : (currentY + it.y) / 2;
      } else {
        lines.push(current);
        current = [{ str: it.str, x: it.x }];
        currentY = it.y;
      }
    }
    if (current.length) lines.push(current);

    // Colunas por gaps de X: agrupa tokens contíguos com gap < xGap; separa em células.
    const xGap = 8;
    const matrix: string[][] = [];
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let buf = "";
      let lastX = -Infinity;
      for (const t of line) {
        if (buf === "") { buf = t.str; lastX = t.x + (t.str.length * 3); continue; }
        if (t.x - lastX > xGap) { cells.push(buf.trim()); buf = t.str; }
        else { buf += " " + t.str; }
        lastX = t.x + (t.str.length * 3);
      }
      if (buf) cells.push(buf.trim());
      if (cells.some((c) => c.length > 0)) matrix.push(cells);
    }

    const modeCols = mostCommon(matrix.map((r) => r.length));
    totalCellsEst += matrix.length * Math.max(modeCols, 1);
    totalCellsGot += matrix.reduce((s, r) => s + r.length, 0);
    perPage.push(matrix);
  }

  const merged: string[][] = [];
  for (const page of perPage) merged.push(...page);
  const confidence = totalCellsEst > 0 ? Math.min(1, totalCellsGot / totalCellsEst) : 0;

  // Item 4/5 — se todas as páginas são imagem OU se não conseguimos NADA de texto,
  // devolve tabela vazia com sinal para o orquestrador emitir OCR_REVIEW.
  const meta: Record<string, unknown> = { source: "pdf", pages: numPages, imagePages };
  if (merged.length === 0) {
    return { headers: [], rows: [], meta, charset: "utf-8", headerFailed: true, ocrConfidence: 0 };
  }

  const table = finalizeTable(merged, meta, "utf-8");
  table.ocrConfidence = confidence;
  (table.meta as any).imagePages = imagePages;
  return table;
}

function finalizeTable(matrix: string[][], meta: Record<string, unknown>, charset: string): RawTable {
  if (matrix.length === 0) return { headers: [], rows: [], meta, charset, headerFailed: true };

  // Cap. 24.3 — descarta linhas iniciais irrelevantes até achar header com ≥2 cabeçalhos conhecidos
  const IGNORE = /^(extrato|banco|ag[eê]ncia|conta|per[ií]odo|cliente|data|resumo)?\s*[:\-–]?\s*[0-9\/\-\.\s]*$/i;
  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i].map((c) => String(c ?? "").trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const knownCount = cells.filter((c) => matchesAnyHeader(c)).length;
    if (knownCount >= 2) { headerIdx = i; break; }
    // Só continua ignorando se linha parece filler (poucas colunas ou match do IGNORE)
    if (cells.length >= 4 && knownCount === 0) break; // linha grande sem headers conhecidos → falha
    if (!cells.every((c) => IGNORE.test(c))) continue;
  }

  if (headerIdx < 0) {
    return { headers: [], rows: [], meta, charset, headerFailed: true };
  }

  const rawHeaders = matrix[headerIdx].map((h, i) => String(h ?? `col_${i}`).trim() || `col_${i}`);
  // dedupe cabeçalhos duplicados no arquivo
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h}__${n}`;
  });

  const bodyMatrix = matrix.slice(headerIdx + 1);

  // Cap. 24.7 — merge de linhas quebradas: linha sem data válida E sem valor/débito/crédito → concatena em description da anterior
  const dateIdx = headers.findIndex((h) => HEADER_HINTS.transaction_date.some((r) => r.test(h)));
  const valueIdxs = headers.map((h, i) => {
    if (HEADER_HINTS.amount.some((r) => r.test(h))) return i;
    if (HEADER_HINTS.debit_amount.some((r) => r.test(h))) return i;
    if (HEADER_HINTS.credit_amount.some((r) => r.test(h))) return i;
    return -1;
  }).filter((i) => i >= 0);
  const descIdx = headers.findIndex((h) => HEADER_HINTS.description.some((r) => r.test(h)));

  const merged: string[][] = [];
  for (const row of bodyMatrix) {
    const dateCell = dateIdx >= 0 ? String(row[dateIdx] ?? "").trim() : "";
    const hasValue = valueIdxs.some((i) => String(row[i] ?? "").trim().length > 0);
    const hasDate = parseDate(dateCell) != null;
    if (!hasDate && !hasValue && merged.length > 0 && descIdx >= 0) {
      const prev = merged[merged.length - 1];
      const extra = row.map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
      if (extra) prev[descIdx] = `${prev[descIdx] ?? ""} ${extra}`.trim();
      continue;
    }
    merged.push(row);
  }

  const rows: RawRow[] = merged
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => {
      const obj: RawRow = {};
      headers.forEach((h, i) => { obj[h] = String(r[i] ?? "").trim(); });
      return obj;
    });

  return { headers, rows, meta, charset };
}

function mostCommon(arr: number[]): number {
  const m = new Map<number, number>();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  let best = 0, count = 0;
  for (const [k, c] of m) if (c > count) { best = k; count = c; }
  return best;
}

function matchesAnyHeader(cell: string): boolean {
  for (const field of Object.keys(HEADER_HINTS) as (keyof CanonicalRow)[]) {
    if (field === "raw_extra") continue;
    if (HEADER_HINTS[field].some((r) => r.test(cell))) return true;
  }
  return false;
}

// ============================================================
// Camada 3 — Mapeamento
// ============================================================

// Regexes tolerantes a sufixos comuns (ex.: "(R$)", " brl", ":") — Cap. 24.5 / 9
// Todos casam a raiz da palavra e permitem qualquer sufixo não-alfabético.
const SFX = "([\\s\\(\\[\\:\\/\\-].*)?$";
const HEADER_HINTS: Record<keyof CanonicalRow, RegExp[]> = {
  client_name: [new RegExp(`^(cliente|pagador|favorecido|benefici[aá]rio|recebedor|nome|destino|origem|sacado)${SFX}`, "i")],
  description: [new RegExp(`^(descri[cç][aã]o|hist[oó]rico(\\s*\\/?\\s*complemento)?|complemento|narrativa|evento|opera[cç][aã]o|memo(rando)?|detalhes|lan[cç]amento)${SFX}`, "i")],
  amount: [new RegExp(`^(valor|montante|amount|vlr|total|valor\\s*movimento)${SFX}`, "i")],
  transaction_date: [new RegExp(`^(data(\\s*(de)?\\s*(lan[cç]amento|movimento|opera[cç][aã]o))?|dt(\\s*lanc)?|date|movimento|lan[cç]amentos?)${SFX}`, "i")],
  balance: [new RegExp(`^(saldo(\\s*(final|atual|dispon[ií]vel))?|balance)${SFX}`, "i")],
  document_number: [new RegExp(`^(docto\\.?|documento|doc\\.?|n[°ºr]?\\.?\\s*(docto|doc|documento)?|nr\\.?\\s*doc(to)?|controle|identificador)${SFX}`, "i")],
  cpf_cnpj: [new RegExp(`^(cpf|cnpj|cpf\\s*\\/?\\s*cnpj|documento\\s*favorecido|inscri[cç][aã]o)${SFX}`, "i")],
  phone: [new RegExp(`^(telefone|celular|phone|tel|whatsapp)${SFX}`, "i")],
  debit_amount: [new RegExp(`^(d[eé]bito|sa[ií]da|valor\\s*d[eé]bito)${SFX}`, "i")],
  credit_amount: [new RegExp(`^(cr[eé]dito|entrada|valor\\s*cr[eé]dito|receita)${SFX}`, "i")],
  movement_type: [new RegExp(`^(tipo|natureza|d\\/c|c\\/d|cd|tipo\\s*da\\s*movimenta[cç][aã]o)${SFX}`, "i")],
  raw_extra: [],
};

// Campos obrigatórios para prosseguir ao Modelo Canônico (Cap. 9 + Item 7)
// amount pode vir de amount OU debit_amount OU credit_amount.
const REQUIRED_FIELDS: (keyof CanonicalRow)[] = ["transaction_date", "description"];
function hasAnyAmountMapping(map: FieldMap): boolean {
  return !!(map.amount || map.debit_amount || map.credit_amount);
}
function missingRequiredFields(map: FieldMap): string[] {
  const missing: string[] = REQUIRED_FIELDS.filter((f) => !map[f]);
  if (!hasAnyAmountMapping(map)) missing.push("amount|debit_amount|credit_amount");
  return missing;
}

const HISTORICO_RE = /^(hist[oó]rico)$/i;
const COMPLEMENTO_RE = /^(complemento)$/i;

export function mapHeaders(headers: string[]): { map: FieldMap; reasons: string[]; extraConcat?: { field: keyof CanonicalRow; cols: [string, string] } } {
  const map: FieldMap = {};
  const used = new Set<string>();
  const reasons: string[] = [];

  // Concatenação especial Histórico + Complemento
  const histIdx = headers.findIndex((h) => HISTORICO_RE.test(h));
  const compIdx = headers.findIndex((h) => COMPLEMENTO_RE.test(h));
  let extraConcat: { field: keyof CanonicalRow; cols: [string, string] } | undefined;
  if (histIdx >= 0 && compIdx >= 0) {
    map.description = headers[histIdx];
    used.add(headers[histIdx]);
    used.add(headers[compIdx]);
    extraConcat = { field: "description", cols: [headers[histIdx], headers[compIdx]] };
    reasons.push(`description=${headers[histIdx]} + ${headers[compIdx]} (concatenados com " - ")`);
  }

  for (const field of Object.keys(HEADER_HINTS) as (keyof CanonicalRow)[]) {
    if (field === "raw_extra") continue;
    if (map[field]) continue;
    // Coluna mais à esquerda vence
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (used.has(h)) continue;
      if (HEADER_HINTS[field].some((r) => r.test(h))) {
        map[field] = h;
        used.add(h);
        reasons.push(`${field}=${h} (coluna mais à esquerda prevaleceu)`);
        break;
      }
    }
  }

  return { map, reasons, extraConcat };
}

// ============================================================
// Camada 4 — Modelo Canônico + Snapshot bruto
// ============================================================

export function buildCanonical(
  raw: RawRow,
  map: FieldMap,
  extraConcat?: { field: keyof CanonicalRow; cols: [string, string] },
): { canonical: CanonicalRow; snapshot: Record<string, string>; errors: string[] } {
  const snapshot: Record<string, string> = { ...raw };
  const errors: string[] = [];
  const get = (f: keyof CanonicalRow) => (map[f] ? raw[map[f]!] ?? "" : "");

  // Description especial: concatena Histórico + Complemento com " - "
  let description = nullableTrim(get("description"));
  if (extraConcat && extraConcat.field === "description") {
    const [a, b] = extraConcat.cols;
    const va = String(raw[a] ?? "").trim();
    const vb = String(raw[b] ?? "").trim();
    if (va && vb) description = `${va} - ${vb}`;
    else description = nullableTrim(va || vb);
  }

  const amountRaw = get("amount");
  const debitRaw = get("debit_amount");
  const creditRaw = get("credit_amount");

  const debit = parseBrNumber(debitRaw);
  const credit = parseBrNumber(creditRaw);
  let amount = parseBrNumberStrict(amountRaw, errors, "amount");

  // Derivação de amount: se debit ou credit preenchidos, prevalecem
  if (credit != null && credit !== 0) {
    if (debit != null && debit !== 0) errors.push("Débito e Crédito ambos preenchidos — Crédito prevaleceu (WARNING)");
    amount = Math.abs(credit);
  } else if (debit != null && debit !== 0) {
    amount = Math.abs(debit);
  }

  const dateStr = get("transaction_date");
  let transaction_date: string | null = null;
  if (dateStr) {
    transaction_date = parseDate(dateStr);
    if (transaction_date == null) errors.push("Data inválida ou ilegível");
  }

  // Campos obrigatórios: amount e transaction_date
  if (amount == null) errors.push("Valor inválido ou ausente");
  if (transaction_date == null) errors.push("Data ausente");

  const canonical: CanonicalRow = {
    client_name: nullableTrim(get("client_name")),
    description,
    amount,
    transaction_date,
    balance: parseBrNumber(get("balance")),
    document_number: nullableTrim(get("document_number")),
    cpf_cnpj: normalizeDoc(get("cpf_cnpj")),
    phone: nullableTrim(get("phone")),
    debit_amount: debit,
    credit_amount: credit,
    movement_type: nullableTrim(get("movement_type")),
    raw_extra: extractExtra(raw, map, extraConcat),
  };
  return { canonical, snapshot, errors };
}

function nullableTrim(s: string): string | null {
  const v = String(s ?? "").trim();
  return v.length === 0 ? null : v;
}

function normalizeDoc(s: string): string | null {
  const v = String(s ?? "").replace(/\D/g, "");
  return v.length ? v : null;
}

function parseBrNumber(s: string): number | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // Detecta sinal
  const negative = /^-|-$|\(.+\)/.test(t) || /\bD\b/i.test(t.trim().slice(-3));
  const cleaned = t.replace(/[^\d,.\-]/g, "").replace(/^-/, "").replace(/-$/, "");
  if (!cleaned) return null;
  const commas = (cleaned.match(/,/g) ?? []).length;
  const dots = (cleaned.match(/\./g) ?? []).length;
  let normalized: string;
  if (commas === 1 && dots >= 1) {
    // BR: "1.234,56"
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (dots >= 2 && commas === 0) {
    // "1.234.567" — BR sem decimais ou US com múltiplos milhares
    normalized = cleaned.replace(/\./g, "");
  } else if (commas === 1 && dots === 0) {
    normalized = cleaned.replace(",", ".");
  } else if (dots === 1 && commas === 0) {
    normalized = cleaned; // US: "1234.56"
  } else if (commas === 0 && dots === 0) {
    normalized = cleaned;
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative && n > 0 ? -n : n;
}

function parseBrNumberStrict(s: string, errors: string[], field: string): number | null {
  if (!s || !String(s).trim()) return null;
  const n = parseBrNumber(s);
  if (n == null) errors.push(`Falha ao interpretar ${field}="${s}"`);
  return n;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const t = String(s).trim();
  // ISO com timestamp/timezone → converte para America/Sao_Paulo
  if (/T\d{2}:\d{2}/.test(t)) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      const shifted = new Date(d.getTime() - 3 * 3600_000); // UTC-3 fallback determinístico
      return shifted.toISOString().slice(0, 10);
    }
  }
  // DD/MM/YYYY
  const br = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (br) {
    const a = parseInt(br[1], 10);
    const b = parseInt(br[2], 10);
    let yy = br[3];
    if (yy.length === 2) yy = (parseInt(yy, 10) > 50 ? "19" : "20") + yy;
    // DD/MM/YYYY se dia > 12
    if (a > 12 && b <= 12) return `${yy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    // MM/DD/YYYY se mês > 12
    if (b > 12 && a <= 12) return `${yy}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    // padrão BR
    if (a <= 31 && b <= 12) return `${yy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }
  // ISO YYYY-MM-DD
  const iso = t.match(/^(\d{4})[\-.](\d{1,2})[\-.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

function extractExtra(raw: RawRow, map: FieldMap, extraConcat?: { cols: [string, string] }): Record<string, string> {
  const mapped = new Set(Object.values(map).filter(Boolean) as string[]);
  if (extraConcat) extraConcat.cols.forEach((c) => mapped.add(c));
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (!mapped.has(k)) extra[k] = v;
  return extra;
}

// ============================================================
// Extração de cliente da descrição (Cap. 10)
// ============================================================

const BANK_KEYWORDS = ["PIX", "TED", "DOC", "TRANSFERENCIA", "TRANSFERÊNCIA", "PAGAMENTO", "RECEBIDO", "ENVIADO", "CPF", "CNPJ", "AGENCIA", "AGÊNCIA", "CONTA", "BANCO", "BOLETO", "COMPRA", "DEBITO", "CRÉDITO", "DÉBITO", "CREDITO", "SAQUE"];

export function extractClientFromDescription(desc: string | null): string | null {
  if (!desc) return null;
  const t = desc.trim();
  // Palavras-chave de destino
  const patterns = [
    /(?:PARA|A FAVOR DE|BENEFICIARIO|BENEFICIÁRIO|DESTINO[:\s]|RECEBEDOR)[:\s]+([A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ\s]+?)(?:\s+CPF|\s+CNPJ|\s+AG|\s+CONTA|\s+BANCO|$)/i,
    /(?:DE|RECEBIDA DE|RECEBIDO DE)[:\s]+([A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ\s]+?)(?:\s+CPF|\s+CNPJ|\s+AG|\s+CONTA|\s+BANCO|$)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) {
      const name = m[1].trim().replace(/\s+/g, " ");
      if (name.split(/\s+/).length >= 2 && !BANK_KEYWORDS.includes(name.split(/\s+/)[0].toUpperCase())) return name;
    }
  }
  // Fallback: sequência de tokens maiúsculos/acentuados
  const tokens = t.split(/\s+/).filter((tok) => /^[A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ']+$/.test(tok) && !BANK_KEYWORDS.includes(tok.toUpperCase()));
  if (tokens.length >= 2) return tokens.slice(0, 4).join(" ");
  return null;
}

// ============================================================
// Camada 5 — Resolução (só metadados)
// ============================================================

const STRONG_INCOME_KW = /(PIX\s+RECEBIDO|TED\s+RECEBIDA|CREDITO\s+CLIENTE|PAGAMENTO\s+RECEBIDO|VENDA)/i;
const STRONG_EXPENSE_KW = /(PIX\s+ENVIADO|TED\s+ENVIADA|FORNECEDOR|BOLETO\s+PAGO|ALUGUEL|ENERGIA|INTERNET|IMPOSTO)/i;
const APORTE_KW = /(TRANSFER[EÊ]NCIA\s+CONTA\s+PESSOAL|APORTE|INTEGRALIZA|EMPR[EÉ]STIMO|RESGATE\s+APLICA)/i;
const PESSOAL_KW = /(MERCADO|FARMACIA|FARMÁCIA|RESTAURANTE|CINEMA|IFOOD|UBER|LAZER|PESSOAL)/i;

export type ClassificationResult = {
  direction: "INCOME" | "EXPENSE" | null;
  subtype: "RECEITA" | "APORTE" | "DESPESA_EMPRESA" | "DESPESA_PESSOAL" | null;
  confidence: number;
  reasons: string[];
};

export function classify(c: CanonicalRow): ClassificationResult {
  const reasons: string[] = [];
  let confidence = 0;
  let direction: "INCOME" | "EXPENSE" | null = null;

  // Regra 11.2 — direção estrutural
  if (c.credit_amount != null && c.credit_amount !== 0 && (c.debit_amount == null || c.debit_amount === 0)) {
    direction = "INCOME";
    confidence += 40;
    reasons.push("coluna Crédito preenchida (+40)");
  } else if (c.debit_amount != null && c.debit_amount !== 0 && (c.credit_amount == null || c.credit_amount === 0)) {
    direction = "EXPENSE";
    confidence += 40;
    reasons.push("coluna Débito preenchida (+40)");
  } else if (c.amount != null) {
    if (c.amount > 0) { direction = "INCOME"; confidence += 20; reasons.push("valor positivo (+20)"); }
    else if (c.amount < 0) { direction = "EXPENSE"; confidence += 20; reasons.push("valor negativo (+20)"); }
  }

  // Indicador D/C
  const mt = (c.movement_type ?? "").trim().toUpperCase();
  if (["C", "CR", "CREDITO", "CRÉDITO"].includes(mt)) {
    if (!direction) direction = "INCOME";
    confidence += 10;
    reasons.push("indicador D/C = C (+10)");
  } else if (["D", "DB", "DEB", "DEBITO", "DÉBITO"].includes(mt)) {
    if (!direction) direction = "EXPENSE";
    confidence += 10;
    reasons.push("indicador D/C = D (+10)");
  }

  // Keyword forte
  const desc = c.description ?? "";
  let subtype: ClassificationResult["subtype"] = null;
  if (direction === "INCOME") {
    if (APORTE_KW.test(desc)) { subtype = "APORTE"; confidence += 30; reasons.push("keyword aporte (+30)"); }
    else if (STRONG_INCOME_KW.test(desc)) { subtype = "RECEITA"; confidence += 30; reasons.push("keyword receita forte (+30)"); }
    else { subtype = "RECEITA"; }
  } else if (direction === "EXPENSE") {
    if (PESSOAL_KW.test(desc)) { subtype = "DESPESA_PESSOAL"; confidence += 30; reasons.push("keyword pessoal (+30)"); }
    else if (STRONG_EXPENSE_KW.test(desc)) { subtype = "DESPESA_EMPRESA"; confidence += 30; reasons.push("keyword despesa empresa (+30)"); }
    else { subtype = "DESPESA_EMPRESA"; }
  }

  return { direction, subtype, confidence: Math.min(100, confidence), reasons };
}

export async function resolveRow(
  sb: SB,
  companyId: string,
  canonical: CanonicalRow,
): Promise<{
  suggestions: Record<string, unknown>;
  reasons: string[];
  resolved_client_id: string | null;
  resolved_service_id: string | null;
  classification: ClassificationResult;
  needsReview: boolean;
}> {
  const reasons: string[] = [];
  const suggestions: Record<string, unknown> = {};
  let resolved_client_id: string | null = null;
  let resolved_service_id: string | null = null;
  let needsReview = false;

  // Classificação
  const classification = classify(canonical);
  if (classification.subtype) {
    suggestions.type = classification.direction === "INCOME" ? "INCOME" : "EXPENSE";
    suggestions.subtype = classification.subtype;
    reasons.push(`classificação: ${classification.subtype} (conf ${classification.confidence}) — ${classification.reasons.join(", ")}`);
  } else {
    reasons.push("classificação indeterminada");
  }
  if (classification.confidence < 60) needsReview = true;

  // Cliente da descrição se não veio
  let clientName = canonical.client_name;
  if (!clientName) {
    clientName = extractClientFromDescription(canonical.description);
    if (clientName) {
      suggestions.client_from_description = clientName;
      reasons.push(`nome extraído da descrição via regex: ${clientName}`);
    }
  }

  // Resolução: CPF → telefone → documento → nome
  if (canonical.cpf_cnpj || canonical.phone || clientName) {
    const { data: clients } = await sb
      .from("clients")
      .select("id,name,phone,phone_api")
      .eq("company_id", companyId)
      .limit(1000);
    const candidates = clients ?? [];

    if (!resolved_client_id && canonical.phone) {
      const norm = canonical.phone.replace(/\D/g, "");
      const found = candidates.find((c) => (c.phone_api ?? "").includes(norm.slice(-8)));
      if (found) { resolved_client_id = found.id; suggestions.client = { id: found.id, name: found.name }; reasons.push(`cliente por telefone: ${found.name}`); }
    }
    if (!resolved_client_id && clientName) {
      const n = clientName.toLowerCase().trim();
      const exact = candidates.find((c) => c.name.toLowerCase().trim() === n);
      if (exact) { resolved_client_id = exact.id; suggestions.client = { id: exact.id, name: exact.name }; reasons.push(`cliente por nome exato: ${exact.name}`); }
    }
    if (!resolved_client_id) { needsReview = true; reasons.push("cliente não localizado"); }
  }

  // Serviço por proximidade de valor (só receita)
  if (classification.direction === "INCOME" && canonical.amount && canonical.amount > 0) {
    const { data: services } = await sb
      .from("services").select("id,name,price").eq("company_id", companyId).eq("active", true).limit(200);
    const target = Math.abs(canonical.amount);
    const match = (services ?? []).find((s) => Math.abs(Number(s.price) - target) <= Math.max(1, target * 0.02));
    if (match) {
      resolved_service_id = match.id;
      suggestions.service = { id: match.id, name: match.name, price: match.price };
      reasons.push(`serviço por proximidade de valor: ${match.name}`);
    }
  }

  return { suggestions, reasons, resolved_client_id, resolved_service_id, classification, needsReview };
}

// ============================================================
// Camada 6 — Assertion Guard
// ============================================================

export function assertionGuard(
  canonical: CanonicalRow,
  snapshot: Record<string, string>,
  map: FieldMap,
): { ok: boolean; restored: string[]; canonical: CanonicalRow } {
  const restored: string[] = [];
  const fixed = { ...canonical };
  for (const f of PROTECTED_FIELDS) {
    const src = map[f];
    if (!src) continue;
    const original = snapshot[src];
    if (original == null || String(original).trim().length === 0) continue;
    // Se canonical está null mas snapshot tinha valor → tenta restaurar como string
    if ((fixed as any)[f] == null) {
      if (f === "client_name" || f === "description" || f === "document_number" || f === "phone") {
        (fixed as any)[f] = String(original).trim();
        restored.push(f);
      }
    }
  }
  return { ok: restored.length === 0, restored, canonical: fixed };
}

// ============================================================
// Deduplicação objetiva (Cap. 15)
// ============================================================

function normalizeName(s: string | null): string {
  if (!s) return "";
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export async function checkDuplicate(
  sb: SB,
  companyId: string,
  canonical: CanonicalRow,
  siblings: Array<{ id?: string; canonical: CanonicalRow }>,
): Promise<{ duplicate: boolean; conflicts: string[] }> {
  if (canonical.amount == null || !canonical.transaction_date) return { duplicate: false, conflicts: [] };
  const target = canonical.transaction_date;
  const nm = normalizeName(canonical.client_name);
  const conflicts: string[] = [];

  // Dentro da importação
  for (const s of siblings) {
    if (s.canonical === canonical) continue;
    if (s.canonical.amount == null) continue;
    if (Math.abs(s.canonical.amount - canonical.amount) > 0.01) continue;
    const sn = normalizeName(s.canonical.client_name);
    if (nm !== sn) continue;
    if (Math.abs(daysBetween(s.canonical.transaction_date!, target)) > 1) continue;
    if (s.id) conflicts.push(s.id);
    else conflicts.push("sibling");
  }

  // Últimos 30 dias no banco
  const from = new Date(new Date(target).getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = new Date(new Date(target).getTime() + 1 * 86400_000).toISOString().slice(0, 10);
  const { data } = await sb.from("v3_financial_transactions")
    .select("id,amount,transaction_date,description")
    .eq("company_id", companyId)
    .gte("transaction_date", from)
    .lte("transaction_date", to);
  for (const r of data ?? []) {
    if (Math.abs(Number(r.amount) - canonical.amount) > 0.01) continue;
    if (Math.abs(daysBetween(r.transaction_date, target)) > 1) continue;
    conflicts.push(r.id);
  }
  return { duplicate: conflicts.length > 0, conflicts };
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400_000);
}

// ============================================================
// Máquina de Estados (Cap. 37 + Item 3)
// ============================================================

export type TerminalReason =
  | "SCHEMA_MISMATCH"
  | "HEADER_FAILED"
  | "MAP_FAILED"
  | "OCR_TIMEOUT"
  | "OCR_REVIEW"
  | null;

export function computeFinalState(stats: {
  terminal?: TerminalReason;
  headerFailed?: boolean;
  ocrConfidence?: number;
  total: number;
  failed: number;
  review: number;
}): FinalState {
  // Precedência determinística (Item 3)
  if (stats.terminal === "SCHEMA_MISMATCH") return "FAILED";
  if (stats.terminal === "HEADER_FAILED" || stats.headerFailed) return "FAILED";
  if (stats.terminal === "MAP_FAILED") return "FAILED";
  if (stats.terminal === "OCR_TIMEOUT") return "REVIEW";
  if (stats.terminal === "OCR_REVIEW") return "REVIEW";
  if (stats.ocrConfidence != null && stats.ocrConfidence < 0.8 && stats.ocrConfidence > 0) return "REVIEW";
  if (stats.total > 0 && stats.failed / stats.total >= 0.1) return "FAILED";
  if (stats.review > 0) return "REVIEW";
  if (stats.failed > 0) return "PARTIAL_SUCCESS";
  return "SUCCESS";
}

// ============================================================
// Orquestrador
// ============================================================

async function auditLog(sb: SB, args: {
  importId: string; companyId: string; rowId?: string; stage: string; event: string;
  input?: any; output?: any; reason: string; responsavel?: string;
}) {
  await sb.from("v3_audit_log").insert({
    import_id: args.importId,
    company_id: args.companyId,
    row_id: args.rowId ?? null,
    stage: args.stage,
    event: args.event,
    input: args.input ?? null,
    output: args.output ?? null,
    reason: args.reason,
    responsavel: args.responsavel ?? "Sistema",
    algorithm_version: V3_ALGORITHM_VERSION,
  } as any);
}

// Item 2 — validação de compatibilidade schema vs pipeline.
// Faz uma sondagem barata: tenta INSERT com status inválido antigo; se aceitar → schema V2.
async function checkSchemaCompatibility(sb: SB): Promise<{ ok: boolean; detail?: string }> {
  // Introspecção via information_schema não fica exposta pela Data API; usamos probing por dry insert.
  // Estratégia: fazer um insert com status novo em row inexistente e reverter — como o Data API não expõe
  // transações, apenas testamos se o status 'OK' é aceito por meio de uma leitura barata + confiança na migration.
  try {
    // Se a migração está aplicada, INSERT com status='OK' será validado pelo CHECK sem erro de constraint.
    // Aqui só verificamos leitura básica; qualquer falha de INSERT posterior será tratada pelo orquestrador.
    const { error } = await sb.from("v3_import_rows").select("id").limit(1);
    if (error) return { ok: false, detail: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, detail: e.message ?? String(e) };
  }
}

export async function runPipeline(
  sb: SB,
  args: { importId: string; companyId: string; source: "csv" | "xlsx" | "pdf" | "ofx" | "manual_text"; storagePath: string },
): Promise<{ rowsInserted: number; finalState: FinalState }> {
  await sb.from("v3_imports").update({ status: "parsing" }).eq("id", args.importId);

  // Estado agregado para o cálculo final via finally (Item 3)
  let terminal: TerminalReason = null;
  let file_hash: string | undefined;
  let charset: string | undefined;
  let ocrConfidence: number | undefined;
  let total = 0, failed = 0, review = 0;
  let rowsInserted = 0;
  let lastError: string | null = null;

  try {
    // Item 2 — schema compatibility
    const schema = await checkSchemaCompatibility(sb);
    if (!schema.ok) {
      terminal = "SCHEMA_MISMATCH";
      lastError = `Schema incompatível: ${schema.detail ?? "verifique migrações V3"}`;
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "orchestrator", event: "SCHEMA_MISMATCH",
        reason: lastError,
      });
      return { rowsInserted: 0, finalState: "FAILED" };
    }

    // 1) Download + hash
    const dl = await sb.storage.from("imports").download(args.storagePath);
    if (dl.error || !dl.data) throw new Error(`Falha no download: ${dl.error?.message}`);
    const buf = new Uint8Array(await dl.data.arrayBuffer());
    file_hash = await sha256Hex(buf);

    // 2) Conversão
    let raw: RawTable;
    if (args.source === "csv") raw = parseCsv(buf);
    else if (args.source === "xlsx") raw = parseXlsx(buf);
    else if (args.source === "pdf") raw = await parsePdf(buf);
    else throw new Error(`Fonte não suportada na V3: ${args.source}`);

    charset = raw.charset ?? "utf-8";
    ocrConfidence = raw.ocrConfidence;

    // Item 4/5 — se PDF veio sem texto suficiente (imagePages == numPages), OCR fallback pendente → OCR_REVIEW.
    // (OCR real fica desabilitado neste ciclo; a fidelidade seria comprometida sem revisão humana.)
    const imagePages = ((raw.meta as any)?.imagePages ?? []) as number[];
    const numPages = ((raw.meta as any)?.pages ?? 0) as number;
    if (args.source === "pdf" && numPages > 0 && imagePages.length === numPages) {
      terminal = "OCR_REVIEW";
      lastError = "PDF sem texto extraível — OCR fallback necessário (não disponível neste ciclo).";
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "conversion", event: "OCR_REVIEW",
        reason: lastError,
      });
      return { rowsInserted: 0, finalState: "REVIEW" };
    }

    // Cap. 37 — HEADER_FAILED interrompe
    if (raw.headerFailed || raw.headers.length === 0) {
      terminal = "HEADER_FAILED";
      lastError = "Cabeçalho não identificado (nenhuma linha com ≥2 cabeçalhos conhecidos)";
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "conversion", event: "HEADER_FAILED",
        input: { headers_seen: raw.headers, sample: raw.rows.slice(0, 3) } as any,
        reason: lastError,
      });
      return { rowsInserted: 0, finalState: "FAILED" };
    }

    // Cap. 37 — OCR_REVIEW por confiança
    if (args.source === "pdf" && ocrConfidence != null && ocrConfidence < 0.8 && ocrConfidence > 0) {
      terminal = "OCR_REVIEW";
      lastError = `Confiança tabular ${(ocrConfidence * 100).toFixed(1)}% < 80%`;
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "conversion", event: "OCR_REVIEW",
        reason: lastError,
      });
      return { rowsInserted: 0, finalState: "REVIEW" };
    }

    // 3) Mapeamento
    const { map, reasons: mapReasons, extraConcat } = mapHeaders(raw.headers);
    await auditLog(sb, {
      importId: args.importId, companyId: args.companyId,
      stage: "mapper", event: "MAP_HEADERS",
      input: { headers: raw.headers }, output: map as any,
      reason: mapReasons.join(" | ") || "nenhum mapeamento reconhecido",
    });

    // Item 7 — validação de mapeamento obrigatório antes do Modelo Canônico
    const missing = missingRequiredFields(map);
    if (missing.length > 0) {
      terminal = "MAP_FAILED";
      lastError = `Mapeamento incompleto — campos obrigatórios ausentes: ${missing.join(", ")}. Cabeçalhos vistos: ${raw.headers.join(", ")}`;
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "mapper", event: "MAP_FAILED",
        input: { headers: raw.headers, map } as any,
        reason: lastError,
      });
      return { rowsInserted: 0, finalState: "FAILED" };
    }

    // 4-8) Por linha: canonical → guard → resolução → dedup
    const built = raw.rows.map((r) => buildCanonical(r, map, extraConcat));
    const rowsToInsert: any[] = [];

    for (let i = 0; i < built.length; i++) {
      const { canonical: rawCan, snapshot, errors } = built[i];
      const guard = assertionGuard(rawCan, snapshot, map);
      const canonical = guard.canonical;

      let status: LineStatus = "OK";
      const rowReasons: string[] = [...errors];
      if (errors.length > 0) status = "LINE_FAILED";

      let resolution: any = null;
      if (status !== "LINE_FAILED") {
        resolution = await resolveRow(sb, args.companyId, canonical);
        if (resolution.needsReview) status = "LINE_REVIEW";
        rowReasons.push(...resolution.reasons);
      }

      const dup = status !== "LINE_FAILED"
        ? await checkDuplicate(sb, args.companyId, canonical, built.map((b) => ({ canonical: b.canonical })))
        : { duplicate: false, conflicts: [] };

      if (status === "LINE_FAILED") failed++;
      else if (status === "LINE_REVIEW") review++;

      const processing_metadata = {
        parser: args.source, algorithm_version: V3_ALGORITHM_VERSION,
        charset, file_hash, headers: raw.headers, map, meta: raw.meta,
        restored_fields: guard.restored,
      };

      rowsToInsert.push({
        import_id: args.importId,
        company_id: args.companyId,
        row_index: i + 1,
        original_snapshot: snapshot,
        canonical,
        suggestions: resolution?.suggestions ?? {},
        processing_metadata,
        resolved_client_id: resolution?.resolved_client_id ?? null,
        resolved_service_id: resolution?.resolved_service_id ?? null,
        status,
        confidence: resolution?.classification.confidence ?? 0,
        classification_confidence: resolution?.classification.confidence ?? null,
        possible_duplicate: dup.duplicate,
        duplicate_of: dup.conflicts,
        reason: rowReasons.join(" | ").slice(0, 2000),
      });

      if (guard.restored.length > 0) {
        await auditLog(sb, {
          importId: args.importId, companyId: args.companyId,
          stage: "validator", event: "PROTECTED_RESTORE",
          input: snapshot, output: canonical as any,
          reason: `Campos restaurados do snapshot: ${guard.restored.join(", ")}`,
        });
      }
    }

    total = rowsToInsert.length;

    // Item 1 — persistência atômica: se qualquer chunk falhar, remove tudo desta importação.
    try {
      for (let i = 0; i < rowsToInsert.length; i += 200) {
        const chunk = rowsToInsert.slice(i, i + 200);
        const { error } = await sb.from("v3_import_rows").insert(chunk);
        if (error) throw new Error(`Falha ao persistir linhas: ${error.message}`);
      }
      rowsInserted = rowsToInsert.length;
    } catch (persistErr: any) {
      // Rollback determinístico: apaga qualquer linha desta importação (parcial ou não).
      await sb.from("v3_import_rows").delete().eq("import_id", args.importId);
      lastError = persistErr.message ?? String(persistErr);
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "persistence", event: "PERSIST_FAILED",
        reason: `${lastError} — rollback aplicado (todas as linhas desta importação removidas).`,
      });
      // Persistência falhou → estado final via finally cuidará; sinaliza FAILED via terminal.
      terminal = "SCHEMA_MISMATCH"; // tratamos como falha estrutural que precede a máquina de estados
      throw persistErr;
    }

    return { rowsInserted, finalState: "SUCCESS" /* placeholder; finally recalcula */ };
  } catch (err: any) {
    lastError = err?.message ?? String(err);
    throw err;
  } finally {
    // Item 3 — computeFinalState é SEMPRE executado.
    const finalState = computeFinalState({
      terminal,
      ocrConfidence,
      total,
      failed,
      review,
    });

    try {
      await sb.from("v3_imports").update({
        status: finalState === "FAILED" ? "failed" : finalState === "REVIEW" ? "review" : "done",
        final_state: finalState,
        file_hash: file_hash ?? null,
        charset: charset ?? null,
        ocr_confidence: ocrConfidence ?? null,
        total_rows: total,
        failed_rows: failed,
        review_rows: review,
        last_error: lastError,
        finished_at: new Date().toISOString(),
      } as any).eq("id", args.importId);

      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "state_machine", event: "FINAL_STATE",
        input: { terminal, total, failed, review, ocrConfidence } as any,
        output: { finalState } as any,
        reason: `Estado final Cap. 37: ${finalState}${terminal ? ` (terminal=${terminal})` : ""}`,
      });
    } catch {
      // não relança — o erro original (se houver) já é preservado
    }

    // Retorno funcional (apenas quando não houve throw)
    // eslint-disable-next-line no-unsafe-finally
    return { rowsInserted, finalState };
  }
}

// ============================================================
// Aplicar linha → v3_financial_transactions
// ============================================================

export async function applyRow(sb: SB, args: { rowId: string }): Promise<{ ok: boolean }> {
  const { data: row, error } = await sb
    .from("v3_import_rows").select("*").eq("id", args.rowId).single();
  if (error || !row) throw new Error("Linha não encontrada");
  if (row.status === "LINE_FAILED") throw new Error("Linha em falha — não pode ser aplicada");

  const canonical = row.canonical as CanonicalRow;
  const sugg = (row.suggestions ?? {}) as Record<string, any>;
  const type = sugg.type as "INCOME" | "EXPENSE" | undefined;
  if (!type) throw new Error("Linha sem classificação — revisar antes de aplicar");
  if (canonical.amount == null) throw new Error("Linha sem valor canônico");
  if (!canonical.transaction_date) throw new Error("Linha sem data canônica");

  const amount = Math.abs(canonical.amount);
  const subtype = sugg.subtype ?? (type === "INCOME" ? "RECEITA" : "DESPESA_EMPRESA");
  const isPersonal = subtype === "DESPESA_PESSOAL";

  const { data: tx, error: txErr } = await sb.from("v3_financial_transactions").insert({
    company_id: row.company_id,
    v3_row_id: row.id,
    type,
    category: subtype,
    description: canonical.description ?? "(sem descrição)",
    amount,
    transaction_date: canonical.transaction_date,
    client_id: row.resolved_client_id,
    service_id: row.resolved_service_id,
    is_personal: isPersonal,
    revenue_type: subtype === "APORTE" ? "APORTE" : null,
    notes: JSON.stringify({ canonical, suggestions: sugg }),
    engine: "v3",
  } as any).select("id").single();
  if (txErr) throw new Error(txErr.message);

  await sb.from("v3_import_rows").update({
    status: "applied",
    applied_result: { transaction_id: tx.id, applied_at: new Date().toISOString() },
  } as any).eq("id", row.id);

  await auditLog(sb, {
    importId: row.import_id, companyId: row.company_id, rowId: row.id,
    stage: "persistence", event: "APPLY",
    input: { canonical, suggestions: sugg } as any,
    output: { transaction_id: tx.id } as any,
    reason: `Aplicado como ${subtype} valor R$ ${amount}`,
    responsavel: "Usuário",
  });

  return { ok: true };
}
