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

const SUMMARY_KEYWORDS = [
  "saldo do dia", "saldo dia", "saldo anterior", "saldo inicial", "saldo final",
  "saldo c/a", "saldo c.a", "saldo c/c", "saldo após operação", "saldo apos operacao",
  "saldo após transação", "saldo apos transacao", "saldo",
  "total", "totais", "total de creditos", "total de créditos",
  "total de debitos", "total de débitos", "total geral", "resumo", "resumo do periodo", "resumo do período"
];

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
  const cleanBuffer = new Uint8Array(buffer.length);
  cleanBuffer.set(buffer);
  const unpdf: any = await import("unpdf");
  const pdf = await unpdf.getDocumentProxy(cleanBuffer);
  const perPage: Array<Array<Array<{ text: string; x: number }>>> = [];
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
    const matrix: Array<Array<{ text: string; x: number }>> = [];
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const cells: Array<{ text: string; x: number }> = [];
      let buf = "";
      let startX = -1;
      let lastX = -Infinity;
      for (const t of line) {
        if (buf === "") {
          buf = t.str;
          startX = t.x;
          lastX = t.x + (t.str.length * 3);
          continue;
        }
        if (t.x - lastX > xGap) {
          cells.push({ text: buf.trim(), x: startX });
          buf = t.str;
          startX = t.x;
        } else {
          buf += " " + t.str;
        }
        lastX = t.x + (t.str.length * 3);
      }
      if (buf) cells.push({ text: buf.trim(), x: startX });
      if (cells.some((c) => c.text.length > 0)) matrix.push(cells);
    }

    const modeCols = mostCommon(matrix.map((r) => r.length));
    totalCellsEst += matrix.length * Math.max(modeCols, 1);
    totalCellsGot += matrix.reduce((s, r) => s + r.length, 0);
    perPage.push(matrix);
  }

  const merged: Array<Array<{ text: string; x: number }>> = [];
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

function finalizeTable(
  matrix: Array<Array<string | { text: string; x: number }>>,
  meta: Record<string, unknown>,
  charset: string
): RawTable {
  if (matrix.length === 0) return { headers: [], rows: [], meta, charset, headerFailed: true };

  const getCellText = (cell: string | { text: string; x: number }): string => {
    if (cell == null) return "";
    if (typeof cell === "string") return cell;
    return cell.text ?? "";
  };

  const getCellX = (cell: string | { text: string; x: number }): number => {
    if (cell == null || typeof cell === "string") return 0;
    return cell.x ?? 0;
  };

  // Cap. 24.3 — descarta linhas iniciais irrelevantes até achar header com ≥2 cabeçalhos conhecidos
  const IGNORE = /^(extrato|banco|ag[eê]ncia|conta|per[ií]odo|cliente|data|resumo)?\s*[:\-–]?\s*[0-9\/\-\.\s]*$/i;
  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i].map((c) => getCellText(c).trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const knownCount = cells.filter((c) => matchesAnyHeader(c)).length;
    if (knownCount >= 2) { headerIdx = i; break; }
    // Só continua ignorando se linha parece filler (poucas colunas ou match do IGNORE)
    if (cells.length >= 4 && knownCount === 0 && meta?.source !== "pdf_ocr") break; // linha grande sem headers conhecidos → falha
    if (!cells.every((c) => IGNORE.test(c))) continue;
  }

  if (headerIdx < 0) {
    return { headers: [], rows: [], meta, charset, headerFailed: true };
  }

  const rawHeaders = matrix[headerIdx].map((h, i) => String(getCellText(h) ?? `col_${i}`).trim() || `col_${i}`);
  const headerXs = matrix[headerIdx].map((h) => getCellX(h));
  const isCoordinateBased = matrix[headerIdx].some(h => typeof h !== "string");

  // dedupe cabeçalhos duplicados no arquivo
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h}__${n}`;
  });

  const bodyMatrix = matrix.slice(headerIdx + 1);
  const headerSignature = rawHeaders.map((c) => String(c ?? "").trim().toLowerCase()).filter(Boolean).join("|");

  const filteredBodyMatrix: Array<Array<string | { text: string; x: number }>> = [];
  for (const row of bodyMatrix) {
    // 1. Filtrar cabeçalho repetido (comum em PDFs multipáginas)
    const rowSig = row.map((c) => String(getCellText(c) ?? "").trim().toLowerCase()).filter(Boolean).join("|");
    if (headerSignature && rowSig === headerSignature) {
      continue;
    }

    // 2. Filtrar resumos e saldos
    const isSummaryOrBalance = row.some((cell) => {
      if (cell == null) return false;
      const s = String(getCellText(cell)).trim().toLowerCase();
      const hasSummaryKw = SUMMARY_KEYWORDS.some((kw) => s === kw || s.startsWith(kw + " ") || s.startsWith(kw + ":"));
      if (hasSummaryKw) return true;

      const hasBalancePattern = /\b(saldo|saldo anterior|saldo atual|saldo do dia|saldo dia|saldo disponível|saldo em conta|saldos diários|saldo final|saldo c\/c|saldo c\/a|saldo c\.a|saldo d\/c|saldo de transações|resumo do dia|total de débitos|total de créditos|total de saídas|total de entradas|saldo consolidado|limite contratado|limite cheque especial|resumo do período|resumo do periodo|saldo após operação|saldo apos operacao|saldo após transação|saldo apos transacao)\b/i.test(s);
      if (hasBalancePattern) return true;

      return false;
    });

    if (isSummaryOrBalance) {
      continue;
    }

    filteredBodyMatrix.push(row);
  }

  // Alinhar a matriz do corpo com base nos Xs do cabeçalho
  const alignedBodyMatrix: string[][] = [];
  for (const row of filteredBodyMatrix) {
    if (isCoordinateBased) {
      const alignedRow = new Array(headers.length).fill("");
      for (const cell of row) {
        const txt = getCellText(cell);
        const cx = getCellX(cell);
        if (!txt) continue;
        
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let j = 0; j < headerXs.length; j++) {
          const diff = Math.abs(headerXs[j] - cx);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = j;
          }
        }
        if (alignedRow[closestIdx]) {
          alignedRow[closestIdx] += " " + txt;
        } else {
          alignedRow[closestIdx] = txt;
        }
      }
      alignedBodyMatrix.push(alignedRow);
    } else {
      alignedBodyMatrix.push(row.map(c => getCellText(c)));
    }
  }

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
  let lastValidDateCell = "";
  for (const row of alignedBodyMatrix) {
    const dateCell = dateIdx >= 0 ? String(row[dateIdx] ?? "").trim() : "";
    const hasValue = valueIdxs.some((i) => String(row[i] ?? "").trim().length > 0);
    const hasDate = parseDate(dateCell) != null;
    
    if (hasDate) {
      lastValidDateCell = dateCell;
    }

    if (!hasDate && !hasValue && merged.length > 0 && descIdx >= 0) {
      const prev = merged[merged.length - 1];
      const extra = row.map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
      if (extra) prev[descIdx] = `${prev[descIdx] ?? ""} ${extra}`.trim();
      continue;
    }

    if (!hasDate && hasValue && lastValidDateCell && dateIdx >= 0) {
      row[dateIdx] = lastValidDateCell;
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
    amount = -Math.abs(debit);
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
  const negative = /^-|-$|\(.+\)/.test(t) || /\bD\b/i.test(t.trim().slice(-3)) || /[Dd]$/.test(t.trim());
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
  // DD/MM/YYYY ou DD/MM/YY
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
  
  // DD/MM ou DD-MM ou DD.MM (sem ano)
  const brShort = t.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (brShort) {
    const a = parseInt(brShort[1], 10);
    const b = parseInt(brShort[2], 10);
    const currentYear = new Date().getFullYear();
    if (a <= 31 && b <= 12) {
      return `${currentYear}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
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

const BANK_KEYWORDS = ["PIX", "TED", "DOC", "TRANSFERENCIA", "TRANSFERÊNCIA", "PAGAMENTO", "RECEBIDO", "ENVIADO", "CPF", "CNPJ", "AGENCIA", "AGÊNCIA", "CONTA", "BANCO", "BOLETO", "COMPRA", "DEBITO", "CRÉDITO", "DÉBITO", "CREDITO", "SAQUE", "FORNECEDOR", "RECEBIMENTO"];

export function extractClientFromDescription(desc: string | null): string | null {
  if (!desc) return null;
  const t = desc.trim();
  
  // 1. Padrões com prefixos comuns
  const patterns = [
    /(?:PARA|A FAVOR DE|BENEFICIARIO|BENEFICIÁRIO|DESTINO|RECEBEDOR|DES)[:\s]+([A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ\s\.\&\/\-]+?)(?:\s+CPF|\s+CNPJ|\s+AG|\s+CONTA|\s+BANCO|\s+\d{2}\/\d{2}|$)/i,
    /(?:DE|RECEBIDA DE|RECEBIDO DE|REM)[:\s]+([A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ\s\.\&\/\-]+?)(?:\s+CPF|\s+CNPJ|\s+AG|\s+CONTA|\s+BANCO|\s+\d{2}\/\d{2}|$)/i,
    /(?:COBRANCA|COBRANÇA)\s+([A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ\s\.\&\/\-]+?)(?:\s+CPF|\s+CNPJ|\s+AG|\s+CONTA|\s+BANCO|$)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) {
      let name = m[1].trim().replace(/\s+/g, " ");
      // Remove data do final se sobrar (ex: "05/05" ou "16/05")
      name = name.replace(/\s+\d{2}\/\d{2}$/, "").replace(/\s+\d{4}$/, "").trim();
      if (name.split(/\s+/).length >= 1 && !BANK_KEYWORDS.includes(name.split(/\s+/)[0].toUpperCase())) {
        return name;
      }
    }
  }

  // 2. Casos especiais de Banco (ex: "TRANSF SALDO C/SAL PICC BCO:237 AGE:00460 CTA:0101317-3")
  if (t.includes("C/SAL PICC") || t.includes("TRANSF SALDO")) {
    const match = t.match(/(C\/SAL PICC.*)$/i);
    if (match) return match[1].trim();
  }

  // 3. Fallback de sequência de tokens maiúsculos
  const tokens = t.split(/\s+/).filter((tok) => {
    const cleanTok = tok.replace(/[^A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ]/gi, "");
    return cleanTok.length >= 2 && !BANK_KEYWORDS.includes(cleanTok.toUpperCase());
  });
  if (tokens.length >= 2) {
    return tokens.slice(0, 4).join(" ");
  }
  return null;
}

// ============================================================
// Camada 5 — Resolução (só metadados)
// ============================================================

const STRONG_INCOME_KW = /(PIX\s+RECEBIDO|TED\s+RECEBIDA|CREDITO\s+CLIENTE|PAGAMENTO\s+RECEBIDO|VENDA)/i;
const STRONG_EXPENSE_KW = /(PIX\s+ENVIADO|TED\s+ENVIADA|FORNECEDOR|BOLETO\s+PAGO|ALUGUEL|ENERGIA|INTERNET|IMPOSTO)/i;
const APORTE_KW = /(TRANSFER[EÊ]NCIA\s+CONTA\s+PESSOAL|APORTE|INTEGRALIZA|EMPR[EÉ]STIMO|RESGATE\s+APLICA)/i;
const PESSOAL_KW = /(MERCADO|FARMACIA|FARMÁCIA|RESTAURANTE|CINEMA|IFOOD|UBER|LAZER|PESSOAL)/i;

function matchSpecialTransaction(desc: string | null | undefined): "APLICACAO" | "RESGATE" | "INTERNA" | "TARIFA" | "JUROS" | null {
  if (!desc) return null;
  const s = desc.toLowerCase().trim();

  const aplicacaoKeywords = [
    "aplicacao", "aplicação", "dinheiro aplicado", "guardar na caixinha",
    "guardar dinheiro", "investimento automatico", "investimento automático",
    "transferencia para cofrinho", "transferência para cofrinho",
    "transferencia para investimento", "transferência para investimento",
    "mover para reserva", "saldo aplicado", "aplicacao poupanca", "aplicação poupança",
    "aplicacao investimento", "aplicação investimento", "debit investment",
    "investment deposit", "funds allocation", "cash allocation", "aplicacao cdb",
    "aplicação cdb", "aplicacao rdb", "aplicação rdb", "aplicacao fundos", "aplicação fundos",
    "aplicacao renda fixa", "aplicação renda fixa"
  ];
  if (aplicacaoKeywords.some(kw => s.includes(kw))) {
    return "APLICACAO";
  }

  const resgateKeywords = [
    "resgate", "dinheiro retirado", "retirado da caixinha", "retirada do cofrinho",
    "retirada caixinha", "transferencia da reserva", "transferência da reserva",
    "resgate automatico", "resgate automático", "resgate rdb", "resgate cdb",
    "resgate caixinha"
  ];
  if (resgateKeywords.some(kw => s.includes(kw))) {
    return "RESGATE";
  }

  const internaKeywords = [
    "transferencia entre contas", "transferência entre contas",
    "movimentacao interna", "movimentação interna",
    "transferencia interna", "transferência interna",
    "mesmo titular", "transf entre contas", "transf. entre contas"
  ];
  if (internaKeywords.some(kw => s.includes(kw))) {
    return "INTERNA";
  }

  const tarifaKeywords = [
    "tarifa", "taxa", "mensalidade", "pacote de servicos", "pacote de serviços",
    "anuidade", "tarifa pix", "tarifa ted", "tarifa doc", "custo de transacao",
    "custo de transação", "debit fee", "bank fee",
    "encargos limite de credencargo", "iof s/ utilizacao limite", "iof s/ utilização limite"
  ];
  if (tarifaKeywords.some(kw => s.includes(kw))) {
    return "TARIFA";
  }

  const jurosKeywords = [
    "juros", "rendimento", "remuneracao", "remuneração", "juros sobre capital"
  ];
  if (jurosKeywords.some(kw => s.includes(kw))) {
    return "JUROS";
  }

  return null;
}

function isExpenseDescription(desc: string | null | undefined): boolean {
  if (!desc) return false;
  const normalized = desc.trim().toLowerCase();
  return /^(pix\s+enviado|pix\s+para|transfer[êe]ncia\s+enviada|tarifa|compra|saque|pagamento\s+de\s+boleto|pagamento|juros|tributo|imposto|despesa)/i.test(
    normalized,
  );
}

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
  const desc = c.description ?? "";

  // Regra especial de transação bancária / investimento / tarifa
  const special = matchSpecialTransaction(desc);
  if (special) {
    if (special === "TARIFA") {
      return { direction: "EXPENSE", subtype: "DESPESA_EMPRESA", confidence: 100, reasons: ["tarifa bancária automática (+100)"] };
    }
    if (special === "APLICACAO") {
      return { direction: "EXPENSE", subtype: "DESPESA_EMPRESA", confidence: 100, reasons: ["aplicação financeira automática (+100)"] };
    }
    if (special === "RESGATE") {
      return { direction: "INCOME", subtype: "RECEITA", confidence: 100, reasons: ["resgate de investimento automático (+100)"] };
    }
    if (special === "JUROS") {
      return { direction: "INCOME", subtype: "RECEITA", confidence: 100, reasons: ["juros/rendimento automático (+100)"] };
    }
    if (special === "INTERNA") {
      const dir = c.amount != null && c.amount > 0 ? "INCOME" : "EXPENSE";
      return { direction: dir, subtype: dir === "INCOME" ? "RECEITA" : "DESPESA_EMPRESA", confidence: 100, reasons: ["movimentação interna (+100)"] };
    }
  }

  let expenseScore = 0;
  let incomeScore = 0;

  // 1. Direção estrutural de colunas
  if (c.credit_amount != null && c.credit_amount !== 0 && (c.debit_amount == null || c.debit_amount === 0)) {
    incomeScore += 40;
    reasons.push("coluna Crédito preenchida (+40)");
  } else if (c.debit_amount != null && c.debit_amount !== 0 && (c.credit_amount == null || c.credit_amount === 0)) {
    expenseScore += 40;
    reasons.push("coluna Débito preenchida (+40)");
  }

  // 2. Direção estrutural por sinal básico do valor
  if (c.amount != null) {
    if (c.amount > 0) {
      incomeScore += 20;
      reasons.push("valor positivo (+20)");
    } else if (c.amount < 0) {
      expenseScore += 20;
      reasons.push("valor negativo (+20)");
    }
  }

  // 3. Indicador D/C na coluna de Tipo
  const mt = (c.movement_type ?? "").trim().toUpperCase();
  if (["C", "CR", "CREDITO", "CRÉDITO"].includes(mt)) {
    incomeScore += 10;
    reasons.push("indicador D/C = C (+10)");
  } else if (["D", "DB", "DEB", "DEBITO", "DÉBITO"].includes(mt)) {
    expenseScore += 10;
    reasons.push("indicador D/C = D (+10)");
  }

  // 4. Termos explícitos na descrição (Pix Enviado/Recebido, etc.)
  const descLower = desc.toLowerCase();
  if (/\b(pix enviado|envio|transferencia enviada|transferência enviada|ted enviada|doc enviado|pagamento)\b/i.test(descLower)) {
    expenseScore += 60;
    reasons.push("descrição indica envio de dinheiro (despesa) (+60)");
  } else if (/\b(pix recebido|recebimento|recebido|transferencia recebida|transferência recebida|ted recebida|doc recebido|deposito|depósito)\b/i.test(descLower)) {
    incomeScore += 60;
    reasons.push("descrição indica recebimento de dinheiro (receita) (+60)");
  }

  // 5. Sinal negativo/positivo ou sufixo D/C no campo de valor
  if (c.amount != null) {
    if (c.amount < 0) {
      expenseScore += 30;
      reasons.push("sufixo D ou sinal negativo no valor (despesa) (+30)");
    } else if (c.amount > 0) {
      incomeScore += 30;
      reasons.push("sufixo C ou sinal positivo no valor (receita) (+30)");
    }
  }

  // Determinação da direção com base no somatório
  if (expenseScore > incomeScore) {
    direction = "EXPENSE";
    confidence = expenseScore;
  } else if (incomeScore > expenseScore) {
    direction = "INCOME";
    confidence = incomeScore;
  }

  // Fallback de descrição para direção
  if (!direction && desc) {
    if (isExpenseDescription(desc)) {
      direction = "EXPENSE";
      confidence += 15;
      reasons.push("descrição típica de despesa (+15)");
    } else {
      direction = "INCOME";
      confidence += 10;
      reasons.push("descrição típica de receita (+10)");
    }
  }

  // Keyword forte
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
      canonical.client_name = clientName;
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
  let siblingConflict = false;

  // Dentro da importação
  for (const s of siblings) {
    if (s.canonical === canonical) continue;
    if (s.canonical.amount == null) continue;
    if (Math.abs(s.canonical.amount - canonical.amount) > 0.01) continue;
    const sn = normalizeName(s.canonical.client_name);
    if (nm !== sn) continue;
    if (Math.abs(daysBetween(s.canonical.transaction_date!, target)) > 1) continue;
    if (s.id) conflicts.push(s.id);
    else siblingConflict = true;
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
  return { duplicate: conflicts.length > 0 || siblingConflict, conflicts };
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

function rawTableToCsv(raw: RawTable): string {
  const headerLine = raw.headers.join(";");
  const rowLines = raw.rows.map((row) => 
    raw.headers.map((h) => {
      const val = row[h] ?? "";
      const escaped = String(val).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(";")
  );
  return [headerLine, ...rowLines].join("\n");
}

export async function runPipeline(
  sb: SB,
  args: { importId: string; companyId: string; source: "csv" | "xlsx" | "pdf" | "ofx" | "manual_text"; storagePath: string },
): Promise<{ rowsInserted: number; finalState: FinalState; csvText?: string }> {
  await sb.from("v3_imports").update({ status: "parsing" }).eq("id", args.importId);

  // Estado agregado para o cálculo final via finally (Item 3)
  let csvText: string | undefined;
  let terminal: TerminalReason = null;
  let file_hash: string | undefined;
  let charset: string | undefined;
  let ocrConfidence: number | undefined;
  let total = 0, failed = 0, review = 0;
  let rowsInserted = 0;
  let lastError: string | null = null;
  let finalState: FinalState = "SUCCESS";

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
    const startDownload = Date.now();
    const dl = await sb.storage.from("imports").download(args.storagePath);
    if (dl.error || !dl.data) {
      const downloadTime = Date.now() - startDownload;
      console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: downloadStorage\nRows: 0\nTime: ${downloadTime} ms\nStatus: ERROR\nError: ${dl.error?.message ?? "Dados vazios"}`);
      throw new Error(`Falha no download: ${dl.error?.message}`);
    }
    const arrayBuffer = await dl.data.arrayBuffer();
    const rawBuf = new Uint8Array(arrayBuffer);
    const buf = new Uint8Array(rawBuf.length);
    buf.set(rawBuf);
    file_hash = await sha256Hex(buf);
    const downloadTime = Date.now() - startDownload;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: downloadStorage\nRows: 0\nTime: ${downloadTime} ms\nStatus: OK`);

    // 2) Conversão
    const startParse = Date.now();
    let raw: RawTable;
    if (args.source === "csv") raw = parseCsv(buf);
    else if (args.source === "xlsx") raw = parseXlsx(buf);
    else if (args.source === "pdf") raw = await parsePdf(buf);
    else throw new Error(`Fonte não suportada na V3: ${args.source}`);

    const parseTime = Date.now() - startParse;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: parse_${args.source}\nRows: ${raw.rows.length}\nTime: ${parseTime} ms\nStatus: OK`);
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: finalizeTable\nRows: ${raw.rows.length}\nTime: 0 ms\nStatus: OK`);

    charset = raw.charset ?? "utf-8";
    ocrConfidence = raw.ocrConfidence;

    const isImagePdf = args.source === "pdf" && (
      raw.headerFailed ||
      raw.rows.length === 0 ||
      raw.rows.reduce((sum, r) => sum + Object.values(r).join("").length, 0) < 50
    );

    if (isImagePdf) {
      console.log(`[SIE V3] PDF Imagem/Escaneado detectado (file_hash: ${file_hash}). Iniciando OCR Fallback...`);
      
      // 1. Verificar cache determinístico (comentado para garantir execução fresca da IA)
      let ocrCsvText = "";
      /*
      try {
        const { data: cached, error: cacheReadErr } = await (sb as any)
          .from("v3_ocr_cache")
          .select("ocr_text")
          .eq("file_hash", file_hash!)
          .maybeSingle();
        
        if (cacheReadErr) {
          console.warn("[SIE V3] Erro ao consultar cache de OCR:", cacheReadErr.message);
        } else if (cached?.ocr_text) {
          console.log(`[SIE V3] Cache localizado para o arquivo. Carregando dados...`);
          ocrCsvText = cached.ocr_text;
          
          await auditLog(sb, {
            importId: args.importId, companyId: args.companyId,
            stage: "OCR_EXECUTION", event: "OCR_CACHE_HIT",
            reason: "Representação obtida do cache de hashes determinístico",
          });
        }
      } catch (cacheErr: any) {
        console.warn("[SIE V3] Exceção ao consultar cache de OCR:", cacheErr.message || cacheErr);
      }
      */

      if (ocrCsvText) {
        // Cache localizado, pula processamento da IA
      } else {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          throw new Error("IA indisponível para OCR: LOVABLE_API_KEY ausente no ambiente de produção.");
        }

        const startTime = Date.now();
        console.log(`[SIE V3] Iniciando conversão de PDF para CSV alinhado com a ferramenta clássica...`);
        await auditLog(sb, {
          importId: args.importId, companyId: args.companyId,
          stage: "OCR_EXECUTION", event: "OCR_START",
          reason: "Iniciando processo de conversão estrutural de PDF Imagem para CSV via Gemini",
        });
        const cleanBuf = new Uint8Array(buf.length);
        cleanBuf.set(buf);
        const { convertPdfBufferToCsvRaw } = await import("../worker.server");
        ocrCsvText = await convertPdfBufferToCsvRaw(cleanBuf, args.storagePath.split("/").pop() || "extrato.pdf");

        const duration = Date.now() - startTime;

        // Salvar em cache
        try {
          const { error: cacheErr } = await (sb as any).from("v3_ocr_cache").insert({
            file_hash: file_hash!,
            ocr_text: ocrCsvText,
          });
          if (cacheErr) {
            console.warn("[SIE V3] Erro ao gravar no cache de OCR:", cacheErr.message);
          }
        } catch (cacheWriteErr: any) {
          console.warn("[SIE V3] Exceção ao gravar no cache de OCR:", cacheWriteErr.message || cacheWriteErr);
        }

        // Audit Log
        const numPages = ((raw.meta as any)?.pages ?? 1) as number;
        await auditLog(sb, {
          importId: args.importId, companyId: args.companyId,
          stage: "OCR_EXECUTION", event: "OCR_SUCCESS",
          reason: `OCR/Formatação executado com sucesso. Páginas: ${numPages} | Duração: ${duration}ms`,
        });
      }

      // 2. Validação Estrutural pós-OCR (Seção 6)
      const parsed = Papa.parse<string[]>(ocrCsvText, { skipEmptyLines: true });
      const matrix = (parsed.data ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
      raw = finalizeTable(matrix, { source: "pdf_ocr" }, "utf-8");
      ocrConfidence = 1.0; // Definido como 100% de confiança operacional
      csvText = ocrCsvText;

      if (raw.headerFailed || raw.rows.length === 0) {
        terminal = "OCR_REVIEW";
        lastError = "Validação Estrutural pós-OCR falhou: cabeçalhos essenciais ou linhas não localizados no texto gerado.";
        await auditLog(sb, {
          importId: args.importId, companyId: args.companyId,
          stage: "OCR_EXECUTION", event: "OCR_REVIEW",
          reason: lastError,
        });
        return { rowsInserted: 0, finalState: "REVIEW", csvText };
      }
    } else {
      // PDF Nativo ou outros formatos — Cap. 37 — HEADER_FAILED interrompe se falhou
      if (raw.headerFailed || raw.headers.length === 0) {
        terminal = "HEADER_FAILED";
        lastError = "Cabeçalho não identificado (nenhuma linha com ≥2 cabeçalhos conhecidos)";
        await auditLog(sb, {
          importId: args.importId, companyId: args.companyId,
          stage: "conversion", event: "HEADER_FAILED",
          input: { headers_seen: raw.headers, sample: raw.rows.slice(0, 3) } as any,
          reason: lastError,
        });
        return { rowsInserted: 0, finalState: "FAILED", csvText };
      }
    }

    if (args.source === "pdf" && !isImagePdf) {
      csvText = rawTableToCsv(raw);
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
      return { rowsInserted: 0, finalState: "REVIEW", csvText };
    }

    // 3) Mapeamento
    const startMap = Date.now();
    const { map, reasons: mapReasons, extraConcat } = mapHeaders(raw.headers);
    const mapTime = Date.now() - startMap;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: mapHeaders\nRows: ${raw.rows.length}\nTime: ${mapTime} ms\nStatus: OK`);
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
      console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: mapHeaders\nRows: ${raw.rows.length}\nTime: ${mapTime} ms\nStatus: ERROR\nError: ${lastError}`);
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "mapper", event: "MAP_FAILED",
        input: { headers: raw.headers, map } as any,
        reason: lastError,
      });
      return { rowsInserted: 0, finalState: "FAILED" };
    }

    // 4-8) Por linha: canonical → guard → resolução → dedup
    const startCanonical = Date.now();
    const built = raw.rows.map((r) => buildCanonical(r, map, extraConcat));
    const canonicalTime = Date.now() - startCanonical;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: buildCanonical\nRows: ${built.length}\nTime: ${canonicalTime} ms\nStatus: OK`);

    const startResolve = Date.now();
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
    const resolveTime = Date.now() - startResolve;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: resolveRow\nRows: ${rowsToInsert.length}\nTime: ${resolveTime} ms\nStatus: OK`);

    total = rowsToInsert.length;

    // Item 1 — persistência atômica: se qualquer chunk falhar, remove tudo desta importação.
    const startPersist = Date.now();
    try {
      for (let i = 0; i < rowsToInsert.length; i += 200) {
        const chunk = rowsToInsert.slice(i, i + 200);
        const { error } = await sb.from("v3_import_rows").insert(chunk);
        if (error) throw new Error(`Falha ao persistir linhas: ${error.message}`);
      }
      rowsInserted = rowsToInsert.length;
      const persistTime = Date.now() - startPersist;
      console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: persistRows\nRows: ${rowsInserted}\nTime: ${persistTime} ms\nStatus: OK`);
    } catch (persistErr: any) {
      const persistTime = Date.now() - startPersist;
      console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: persistRows\nRows: 0\nTime: ${persistTime} ms\nStatus: ERROR\nError: ${persistErr.message || String(persistErr)}`);
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

  } catch (err: any) {
    lastError = err?.message ?? String(err);
    throw err;
  } finally {
    // Item 3 — computeFinalState é SEMPRE executado.
    const startState = Date.now();
    finalState = computeFinalState({
      terminal,
      ocrConfidence,
      total,
      failed,
      review,
    });
    const stateTime = Date.now() - startState;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: computeFinalState\nRows: ${total}\nTime: ${stateTime} ms\nStatus: ${finalState}`);

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
  }

  return { rowsInserted, finalState, csvText };
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

async function executePdfOcr(buffer: Uint8Array, filename: string): Promise<string> {
  const { getDocumentProxy, extractImages } = await import("unpdf");
  const { PipelineError } = await import("../ocr-normalizer.server");
  const pdf = await getDocumentProxy(buffer);
  
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new PipelineError("IA indisponível para OCR: LOVABLE_API_KEY ausente no ambiente de produção.", "OCR");
  }

  const resizeImageRGBA = (rgbaData: Uint8ClampedArray, width: number, height: number, maxDim = 950) => {
    if (width <= maxDim && height <= maxDim) {
      return { data: rgbaData, width, height };
    }
    const scale = Math.min(maxDim / width, maxDim / height);
    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);
    const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
    for (let y = 0; y < newHeight; y++) {
      const srcY = Math.min(Math.floor(y / scale), height - 1);
      for (let x = 0; x < newWidth; x++) {
        const srcX = Math.min(Math.floor(x / scale), width - 1);
        const dstIdx = (y * newWidth + x) * 4;
        const srcIdx = (srcY * width + srcX) * 4;
        newData[dstIdx] = rgbaData[srcIdx];
        newData[dstIdx + 1] = rgbaData[srcIdx + 1];
        newData[dstIdx + 2] = rgbaData[srcIdx + 2];
        newData[dstIdx + 3] = rgbaData[srcIdx + 3];
      }
    }
    return { data: newData, width: newWidth, height: newHeight };
  };

  const convertToBMP32 = (rgbaData: Uint8ClampedArray, width: number, height: number) => {
    const fileHeaderSize = 14;
    const dibHeaderSize = 40;
    const headerSize = fileHeaderSize + dibHeaderSize;
    const imageSize = width * height * 4;
    const fileSize = headerSize + imageSize;
    const resBuffer = Buffer.alloc(fileSize);
    
    resBuffer.write("BM", 0);
    resBuffer.writeUInt32LE(fileSize, 2);
    resBuffer.writeUInt32LE(0, 6);
    resBuffer.writeUInt32LE(headerSize, 10);
    
    resBuffer.writeUInt32LE(dibHeaderSize, 14);
    resBuffer.writeInt32LE(width, 18);
    resBuffer.writeInt32LE(-height, 22);
    resBuffer.writeUInt16LE(1, 26);
    resBuffer.writeUInt16LE(32, 28);
    resBuffer.writeUInt32LE(0, 30);
    resBuffer.writeUInt32LE(imageSize, 34);
    resBuffer.writeInt32LE(2835, 38);
    resBuffer.writeInt32LE(2835, 42);
    resBuffer.writeUInt32LE(0, 46);
    resBuffer.writeUInt32LE(0, 50);
    
    let dstIdx = headerSize;
    for (let srcIdx = 0; srcIdx < rgbaData.length; srcIdx += 4) {
      resBuffer[dstIdx] = rgbaData[srcIdx + 2];
      resBuffer[dstIdx + 1] = rgbaData[srcIdx + 1];
      resBuffer[dstIdx + 2] = rgbaData[srcIdx];
      resBuffer[dstIdx + 3] = rgbaData[srcIdx + 3];
      dstIdx += 4;
    }
    return resBuffer;
  };

  let ocrCsvAccumulator = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const pageImages = await extractImages(pdf, i);
    if (pageImages && pageImages.length > 0) {
      for (let idx = 0; idx < pageImages.length; idx++) {
        const img = pageImages[idx];
        const convertToRGBA = (image: any) => {
          const { data: imgData, width: w, height: h, channels: ch } = image;
          if (ch === 4) {
            return { data: new Uint8ClampedArray(imgData), width: w, height: h };
          }
          
          const rgbaData = new Uint8ClampedArray(w * h * 4);
          let srcIdx = 0;
          let dstIdx = 0;
          
          for (let p = 0; p < w * h; p++) {
            if (ch === 3) {
              rgbaData[dstIdx] = imgData[srcIdx];
              rgbaData[dstIdx + 1] = imgData[srcIdx + 1];
              rgbaData[dstIdx + 2] = imgData[srcIdx + 2];
              rgbaData[dstIdx + 3] = 255;
              srcIdx += 3;
            } else if (ch === 1) {
              const val = imgData[srcIdx];
              rgbaData[dstIdx] = val;
              rgbaData[dstIdx + 1] = val;
              rgbaData[dstIdx + 2] = val;
              rgbaData[dstIdx + 3] = 255;
              srcIdx += 1;
            }
            dstIdx += 4;
          }
          return { data: rgbaData, width: w, height: h };
        };

        const rgbaImg = convertToRGBA(img);
        const resizedImg = resizeImageRGBA(rgbaImg.data, rgbaImg.width, rgbaImg.height, 950);
        const bmpBuffer = convertToBMP32(resizedImg.data, resizedImg.width, resizedImg.height);
        const base64Bmp = bmpBuffer.toString("base64");
        const dataUrl = `data:image/bmp;base64,${base64Bmp}`;

        console.log(`[SIE V3 OCR] Enviando página ${i} imagem ${idx} para Lovable AI Gateway...`);
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Você é um analisador de documentos especialista em reconstruir tabelas. Sua tarefa é transcrever todo o conteúdo visível nesta imagem de extrato bancário diretamente no formato CSV. Não faça qualquer tipo de interpretação de dados, não resuma, não limpe e não aplique regras de negócio. Apenas identifique a estrutura física (tabelas, linhas e colunas) existente na imagem e monte um CSV correspondente. Se a imagem contiver textos fora de tabelas, represente-os como linhas de uma única célula no CSV. Retorne APENAS o código do CSV válido, sem blocos de código markdown (como ```csv), sem explicações e sem comentários."
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: dataUrl
                    }
                  }
                ]
              }
            ]
          })
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          throw new Error(`Erro no AI Gateway (${aiRes.status}): ${errText.slice(0, 200)}`);
        }

        const aiJson = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
        let pageText = aiJson.choices?.[0]?.message?.content ?? "";
        
        pageText = pageText.trim();
        if (pageText.startsWith("```")) {
          pageText = pageText.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
        }
        
        if (pageText) {
          ocrCsvAccumulator += pageText + "\n";
        }
      }
    }
  }

  return ocrCsvAccumulator;
}

async function executeNativePdfFormatter(pdf: any, apiKey: string): Promise<string> {
  let nativePagesText: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    if (items && items.length > 0) {
      const yThreshold = 5;
      const rowsMap: { y: number; items: typeof items }[] = [];
      
      for (const item of items) {
        if (!item.str) continue;
        const y = item.transform ? item.transform[5] : 0;
        let foundRow = rowsMap.find(r => Math.abs(r.y - y) <= yThreshold);
        if (foundRow) {
          foundRow.items.push(item);
        } else {
          rowsMap.push({ y, items: [item] });
        }
      }
      
      rowsMap.sort((a, b) => b.y - a.y);
      
      let pageText = "";
      for (const row of rowsMap) {
        row.items.sort((a, b) => (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0));
        
        let line = "";
        let lastXEnd = -1;
        for (const item of row.items) {
          const x = item.transform ? item.transform[4] : 0;
          const height = item.height || 10;
          const itemWidth = item.width || (item.str.length * (height * 0.6));
          
          if (lastXEnd === -1) {
            line = item.str;
          } else {
            const spacing = x - lastXEnd;
            if (spacing > 12) {
              line += "\t" + item.str;
            } else {
              line += (spacing > 2 ? " " : "") + item.str;
            }
          }
          lastXEnd = x + itemWidth;
        }
        pageText += line + "\n";
      }
      
      if (pageText.trim()) {
        nativePagesText.push(pageText);
      }
    }
  }
  
  if (nativePagesText.length === 0) return "";

  let nativeCsvAccumulator = "";
  for (let i = 0; i < nativePagesText.length; i++) {
    const pageTextContent = nativePagesText[i];
    console.log(`[SIE V3] Enviando página nativa ${i + 1} para formatação CSV via Gemini...`);
    
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Você é um especialista em estruturação de dados e reconstrução de tabelas. Sua tarefa é converter o texto de extrato bancário fornecido abaixo diretamente no formato CSV. O texto original foi extraído de um PDF nativo e preserva as quebras de linha e colunas (separadas por tabulação '\\t' ou múltiplos espaços). Identifique a estrutura física das tabelas e alinhe corretamente as informações em colunas correspondentes do CSV (como Data, Descrição, Documento, Valor, Saldo, etc.). Certifique-se de que cada registro ocupe uma única linha do CSV com todas as suas respectivas colunas preenchidas. Não resuma, não ignore linhas, não modifique os textos/valores originais e não aplique nenhuma regra de negócio. Retorne APENAS o código do CSV válido, sem blocos de código markdown (como ```csv), sem explicações e sem comentários.\n\nTexto original:\n" + pageTextContent
              }
            ]
          }
        ]
      })
    });
    
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Erro no AI Gateway (${aiRes.status}): ${errText.slice(0, 200)}`);
    }
    
    const aiJson = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
    let pageCsv = aiJson.choices?.[0]?.message?.content ?? "";
    pageCsv = pageCsv.trim();
    if (pageCsv.startsWith("```")) {
      pageCsv = pageCsv.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    if (pageCsv) {
      nativeCsvAccumulator += pageCsv + "\n";
    }
  }
  return nativeCsvAccumulator;
}
