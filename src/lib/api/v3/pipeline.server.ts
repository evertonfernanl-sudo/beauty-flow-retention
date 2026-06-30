// SIE V3 — Pipeline determinístico em camadas. Server-only.
// Camadas: 2 Conversão → 3 Mapeamento → 4 Modelo Canônico → 5 Resolução → 6 Validação → 7 Persistência → 8 Auditoria
// Princípios: fidelidade ao arquivo, canônico = fonte operacional, snapshot = auditoria, decisões com motivo.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

export const V3_ALGORITHM_VERSION = "v3.0.0";

const PROTECTED_FIELDS = [
  "client_name",
  "description",
  "amount",
  "transaction_date",
  "balance",
  "document",
  "cpf_cnpj",
  "phone",
] as const;

export type RawRow = Record<string, string>;
export type RawTable = { headers: string[]; rows: RawRow[]; meta: Record<string, unknown> };

export type CanonicalRow = {
  client_name: string | null;
  description: string | null;
  amount: number | null;
  transaction_date: string | null; // YYYY-MM-DD
  balance: number | null;
  document: string | null;
  cpf_cnpj: string | null;
  phone: string | null;
  credit: number | null;
  debit: number | null;
  type_hint: "INCOME" | "EXPENSE" | null;
  raw_extra: Record<string, string>;
};

// ============================================================
// Camada 2 — Conversão (qualquer formato → tabela bruta única)
// ============================================================

export async function parseCsv(buffer: Uint8Array): Promise<RawTable> {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const allRows = (parsed.data ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (allRows.length === 0) return { headers: [], rows: [], meta: { source: "csv" } };
  const headers = allRows[0].map((h, i) => String(h ?? `col_${i}`).trim());
  const rows = allRows.slice(1).map((r) => {
    const obj: RawRow = {};
    headers.forEach((h, i) => { obj[h] = String(r[i] ?? "").trim(); });
    return obj;
  });
  return { headers, rows, meta: { source: "csv", encoding: "utf-8" } };
}

export async function parseXlsx(buffer: Uint8Array): Promise<RawTable> {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const arr: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const allRows = arr.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (allRows.length === 0) return { headers: [], rows: [], meta: { source: "xlsx" } };
  const headers = allRows[0].map((h, i) => String(h ?? `col_${i}`).trim());
  const rows = allRows.slice(1).map((r) => {
    const obj: RawRow = {};
    headers.forEach((h, i) => { obj[h] = String(r[i] ?? "").trim(); });
    return obj;
  });
  return { headers, rows, meta: { source: "xlsx", sheet: wb.SheetNames[0] } };
}

// PDF parser — reconstrução tabular fiel. SEM interpretação financeira.
export async function parsePdf(buffer: Uint8Array): Promise<RawTable> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  const rawText = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  // Reconstrução fiel: cada linha não-vazia vira um registro.
  // Heurística mínima de colunagem por largura de espaços — sem corrigir/inferir conteúdo.
  const lines = rawText.split(/\r?\n/).map((l) => l.replace(/\s+$/g, "")).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], meta: { source: "pdf", pages: pdf.numPages } };
  // Tenta detectar tabela por padrão "Data … Descrição … Valor".
  // Sem detecção, retorna uma coluna única "linha" para mapeamento posterior.
  const splitByMultiSpace = (s: string) => s.split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean);
  const matrix = lines.map(splitByMultiSpace);
  const widths = matrix.map((r) => r.length);
  const mode = mostCommon(widths);
  if (mode >= 3) {
    const tableLines = matrix.filter((r) => r.length === mode);
    const headers = tableLines[0].map((h, i) => h || `col_${i}`);
    const rows = tableLines.slice(1).map((r) => {
      const obj: RawRow = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return obj;
    });
    return { headers, rows, meta: { source: "pdf", pages: pdf.numPages, mode } };
  }
  // Fallback: cada linha = um registro de coluna única
  return {
    headers: ["linha"],
    rows: lines.map((l) => ({ linha: l })),
    meta: { source: "pdf", pages: pdf.numPages, fallback: "single_column" },
  };
}

function mostCommon(arr: number[]): number {
  const m = new Map<number, number>();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  let best = 0, count = 0;
  for (const [k, c] of m) if (c > count) { best = k; count = c; }
  return best;
}

// ============================================================
// Camada 3 — Mapeamento (cabeçalhos → campos canônicos)
// Único módulo a evoluir quando novo banco surgir.
// ============================================================

const HEADER_HINTS: Record<keyof CanonicalRow, RegExp[]> = {
  client_name: [/^(cliente|pagador|favorecido|beneficiario|nome|sacado)$/i, /cliente|pagador|favorecido/i],
  description: [/^(descricao|descrição|historico|histórico|memo|memorando|detalhes|lancamento|lançamento)$/i, /descric|histor|memo/i],
  amount: [/^(valor|montante|amount|vlr|total)$/i, /valor|amount/i],
  transaction_date: [/^(data|dt|date|data_lancamento|data_movimento|dt_lanc)$/i, /^data|date|dt_/i],
  balance: [/^(saldo|balance|saldo_atual)$/i, /saldo|balance/i],
  document: [/^(documento|doc|nr_doc|numero_documento|n_documento)$/i, /docum|^doc$/i],
  cpf_cnpj: [/^(cpf|cnpj|cpf_cnpj|cpfcnpj)$/i, /cpf|cnpj/i],
  phone: [/^(telefone|celular|phone|tel|whatsapp)$/i, /telefone|celular|phone/i],
  credit: [/^(credito|crédito|entrada|receita|valor_credito)$/i, /credit|entrada/i],
  debit: [/^(debito|débito|saida|saída|despesa|valor_debito)$/i, /debit|saida|saída/i],
  type_hint: [/^(tipo|natureza|d\/c|cd)$/i, /tipo|natureza/i],
  raw_extra: [],
};

export type FieldMap = Partial<Record<keyof CanonicalRow, string>>;

export function mapHeaders(headers: string[]): { map: FieldMap; reason: string } {
  const map: FieldMap = {};
  const used = new Set<string>();
  const reasons: string[] = [];
  for (const field of Object.keys(HEADER_HINTS) as (keyof CanonicalRow)[]) {
    if (field === "raw_extra") continue;
    const patterns = HEADER_HINTS[field];
    // exact match first
    let hit = headers.find((h) => !used.has(h) && patterns[0]?.test(h));
    if (!hit) hit = headers.find((h) => !used.has(h) && patterns[1]?.test(h));
    if (hit) { map[field] = hit; used.add(hit); reasons.push(`${field}=${hit}`); }
  }
  return { map, reason: `Mapeamento por desambiguação de cabeçalho: ${reasons.join(", ") || "nenhuma coluna reconhecida"}` };
}

// ============================================================
// Camada 4 — Modelo Canônico (apenas conversões de formato)
// ============================================================

export function buildCanonical(raw: RawRow, map: FieldMap): { canonical: CanonicalRow; snapshot: Record<string, string> } {
  const snapshot: Record<string, string> = { ...raw };
  const get = (f: keyof CanonicalRow) => (map[f] ? raw[map[f]!] ?? "" : "");
  const canonical: CanonicalRow = {
    client_name: nullableTrim(get("client_name")),
    description: nullableTrim(get("description")),
    amount: parseBrNumber(get("amount")),
    transaction_date: parseDate(get("transaction_date")),
    balance: parseBrNumber(get("balance")),
    document: nullableTrim(get("document")),
    cpf_cnpj: nullableTrim(get("cpf_cnpj")),
    phone: nullableTrim(get("phone")),
    credit: parseBrNumber(get("credit")),
    debit: parseBrNumber(get("debit")),
    type_hint: classifyTypeHint(get("type_hint")),
    raw_extra: extractExtra(raw, map),
  };
  return { canonical, snapshot };
}

function nullableTrim(s: string): string | null {
  const v = String(s ?? "").trim();
  return v.length === 0 ? null : v;
}

function parseBrNumber(s: string): number | null {
  if (!s) return null;
  const t = String(s).trim().replace(/[^\d,.\-+]/g, "");
  if (!t) return null;
  // Formato BR: "1.234,56" → 1234.56
  let normalized = t;
  if (t.includes(",") && t.includes(".")) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",")) {
    normalized = t.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const t = String(s).trim();
  // DD/MM/YYYY
  const br = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (br) {
    const dd = br[1].padStart(2, "0");
    const mm = br[2].padStart(2, "0");
    let yy = br[3];
    if (yy.length === 2) yy = (Number(yy) > 50 ? "19" : "20") + yy;
    return `${yy}-${mm}-${dd}`;
  }
  // ISO YYYY-MM-DD
  const iso = t.match(/^(\d{4})[\-.](\d{1,2})[\-.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

function classifyTypeHint(s: string): "INCOME" | "EXPENSE" | null {
  if (!s) return null;
  const t = s.trim().toUpperCase();
  if (["C", "CR", "CRED", "CREDITO", "CRÉDITO", "ENTRADA", "RECEITA"].includes(t)) return "INCOME";
  if (["D", "DB", "DEB", "DEBITO", "DÉBITO", "SAIDA", "SAÍDA", "DESPESA"].includes(t)) return "EXPENSE";
  return null;
}

function extractExtra(raw: RawRow, map: FieldMap): Record<string, string> {
  const mapped = new Set(Object.values(map).filter(Boolean) as string[]);
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (!mapped.has(k)) extra[k] = v;
  return extra;
}

// ============================================================
// Camada 5 — Resolução (clientes, serviços, classificação)
// Saída: apenas metadados (suggestions). Nunca toca canonical/snapshot.
// ============================================================

export async function resolveRow(
  sb: SB,
  companyId: string,
  canonical: CanonicalRow,
): Promise<{ suggestions: Record<string, unknown>; reasons: string[]; resolved_client_id: string | null; resolved_service_id: string | null }> {
  const reasons: string[] = [];
  const suggestions: Record<string, unknown> = {};
  let resolved_client_id: string | null = null;
  let resolved_service_id: string | null = null;

  // Classificação financeira INCOME/EXPENSE — combina sinais
  const type = inferType(canonical);
  if (type.value) {
    suggestions.type = type.value;
    reasons.push(`type=${type.value} (${type.reason})`);
  }

  // Match de cliente: prioridade CPF/CNPJ → telefone → nome
  if (canonical.cpf_cnpj || canonical.phone || canonical.client_name) {
    const { data: clients } = await sb
      .from("clients")
      .select("id,name,phone,phone_api")
      .eq("company_id", companyId)
      .limit(500);
    const candidates = clients ?? [];
    let hit: { id: string; name: string } | null = null;
    let why = "";
    if (canonical.phone) {
      const norm = canonical.phone.replace(/\D/g, "");
      const found = candidates.find((c) => (c.phone_api ?? "").includes(norm.slice(-8)));
      if (found) { hit = found; why = "telefone"; }
    }
    if (!hit && canonical.client_name) {
      const n = canonical.client_name.toLowerCase().trim();
      const found = candidates.find((c) => c.name.toLowerCase().trim() === n);
      if (found) { hit = found; why = "nome exato"; }
    }
    if (hit) {
      resolved_client_id = hit.id;
      suggestions.client = { id: hit.id, name: hit.name };
      reasons.push(`cliente sugerido por ${why}: ${hit.name}`);
    } else {
      reasons.push("nenhum cliente correspondente encontrado");
    }
  }

  // Match de serviço por valor (apenas se houver receita)
  if ((type.value === "INCOME" || canonical.credit) && canonical.amount && canonical.amount > 0) {
    const { data: services } = await sb
      .from("services")
      .select("id,name,price")
      .eq("company_id", companyId)
      .eq("active", true)
      .limit(200);
    const target = canonical.amount;
    const match = (services ?? []).find((s) => Math.abs(Number(s.price) - target) <= Math.max(1, target * 0.02));
    if (match) {
      resolved_service_id = match.id;
      suggestions.service = { id: match.id, name: match.name, price: match.price };
      reasons.push(`serviço sugerido por proximidade de valor (R$ ${target}): ${match.name}`);
    }
  }

  return { suggestions, reasons, resolved_client_id, resolved_service_id };
}

function inferType(c: CanonicalRow): { value: "INCOME" | "EXPENSE" | null; reason: string } {
  if (c.type_hint) return { value: c.type_hint, reason: "indicador explícito C/D na coluna tipo" };
  if (c.credit && c.credit > 0 && (!c.debit || c.debit === 0)) return { value: "INCOME", reason: "coluna crédito > 0" };
  if (c.debit && c.debit > 0 && (!c.credit || c.credit === 0)) return { value: "EXPENSE", reason: "coluna débito > 0" };
  if (c.amount != null) {
    if (c.amount > 0) return { value: "INCOME", reason: "valor positivo" };
    if (c.amount < 0) return { value: "EXPENSE", reason: "valor negativo" };
  }
  return { value: null, reason: "sem indicadores suficientes" };
}

// ============================================================
// Camada 6 — Validação (diff final vs snapshot)
// ============================================================

export function validateAgainstSnapshot(
  canonical: CanonicalRow,
  snapshot: Record<string, string>,
  map: FieldMap,
): { ok: boolean; restored: string[] } {
  const restored: string[] = [];
  for (const f of PROTECTED_FIELDS) {
    const src = map[f];
    if (!src) continue;
    const original = snapshot[src];
    if (original == null) continue;
    // Apenas verifica presença — não comparamos formato (conversão é permitida).
    if (String(original).trim().length > 0 && (canonical as any)[f] == null) {
      restored.push(f);
    }
  }
  return { ok: restored.length === 0, restored };
}

// ============================================================
// Orquestrador
// ============================================================

export async function runPipeline(
  sb: SB,
  args: { importId: string; companyId: string; source: "csv" | "xlsx" | "pdf" | "ofx" | "manual_text"; storagePath: string },
): Promise<{ rowsInserted: number }> {
  const started = Date.now();
  await sb.from("v3_imports").update({ status: "parsing" }).eq("id", args.importId);

  try {
    // 1) Download
    const dl = await sb.storage.from("imports").download(args.storagePath);
    if (dl.error || !dl.data) throw new Error(`Falha no download: ${dl.error?.message}`);
    const buf = new Uint8Array(await dl.data.arrayBuffer());

    // 2) Conversão
    let raw: RawTable;
    if (args.source === "csv") raw = await parseCsv(buf);
    else if (args.source === "xlsx") raw = await parseXlsx(buf);
    else if (args.source === "pdf") raw = await parsePdf(buf);
    else throw new Error(`Fonte não suportada na V3: ${args.source}`);

    if (raw.rows.length === 0) {
      await sb.from("v3_imports").update({ status: "review", finished_at: new Date().toISOString() }).eq("id", args.importId);
      return { rowsInserted: 0 };
    }

    // 3) Mapeamento (uma vez por arquivo)
    const { map, reason: mapReason } = mapHeaders(raw.headers);

    // Audit do mapeamento
    await sb.from("v3_audit_log").insert({
      import_id: args.importId,
      company_id: args.companyId,
      stage: "mapper",
      event: "MAP_HEADERS",
      input: { headers: raw.headers },
      output: map as any,
      reason: mapReason,
    });

    // 4-8) Para cada linha: canonical → resolução → validação → persistência → auditoria
    const insertedRows: any[] = [];
    for (let i = 0; i < raw.rows.length; i++) {
      const { canonical, snapshot } = buildCanonical(raw.rows[i], map);
      const resolution = await resolveRow(sb, args.companyId, canonical);
      const validation = validateAgainstSnapshot(canonical, snapshot, map);

      const processing_metadata = {
        parser: args.source,
        algorithm_version: V3_ALGORITHM_VERSION,
        elapsed_ms: Date.now() - started,
        headers: raw.headers,
        map,
        meta: raw.meta,
      };

      const status: "matched" | "review" = resolution.resolved_client_id && resolution.suggestions.type ? "matched" : "review";
      const confidence = computeConfidence(canonical, resolution);

      insertedRows.push({
        import_id: args.importId,
        company_id: args.companyId,
        row_index: i + 1,
        original_snapshot: snapshot,
        canonical,
        suggestions: resolution.suggestions,
        processing_metadata,
        resolved_client_id: resolution.resolved_client_id,
        resolved_service_id: resolution.resolved_service_id,
        status,
        confidence,
      });

      // Auditoria por linha
      if (resolution.reasons.length > 0) {
        await sb.from("v3_audit_log").insert({
          import_id: args.importId,
          company_id: args.companyId,
          stage: "resolution",
          event: "RESOLVE",
          input: canonical as any,
          output: resolution.suggestions as any,
          reason: resolution.reasons.join(" | "),
        });
      }
      if (!validation.ok) {
        await sb.from("v3_audit_log").insert({
          import_id: args.importId,
          company_id: args.companyId,
          stage: "validator",
          event: "VALIDATION_WARN",
          input: snapshot as any,
          output: canonical as any,
          reason: `Campos protegidos sem valor canônico apesar de presentes no arquivo: ${validation.restored.join(", ")}`,
        });
      }
    }

    // Persistência em lote
    const chunkSize = 200;
    for (let i = 0; i < insertedRows.length; i += chunkSize) {
      const chunk = insertedRows.slice(i, i + chunkSize);
      const { error } = await sb.from("v3_import_rows").insert(chunk);
      if (error) throw new Error(`Falha ao persistir linhas: ${error.message}`);
    }

    await sb.from("v3_imports").update({
      status: "review",
      finished_at: new Date().toISOString(),
    }).eq("id", args.importId);

    return { rowsInserted: insertedRows.length };
  } catch (err: any) {
    await sb.from("v3_imports").update({
      status: "failed",
      last_error: err.message ?? String(err),
      finished_at: new Date().toISOString(),
    }).eq("id", args.importId);
    throw err;
  }
}

function computeConfidence(c: CanonicalRow, r: { resolved_client_id: string | null; suggestions: Record<string, unknown> }): number {
  let s = 0;
  if (c.amount != null) s += 25;
  if (c.transaction_date) s += 25;
  if (c.description) s += 10;
  if (r.suggestions.type) s += 15;
  if (r.resolved_client_id) s += 15;
  if (r.suggestions.service) s += 10;
  return Math.min(100, s);
}

// ============================================================
// Aplicar linha → grava em v3_financial_transactions
// ============================================================

export async function applyRow(sb: SB, args: { rowId: string }): Promise<{ ok: boolean }> {
  const { data: row, error } = await sb
    .from("v3_import_rows")
    .select("*")
    .eq("id", args.rowId)
    .single();
  if (error || !row) throw new Error("Linha não encontrada");

  const canonical = row.canonical as CanonicalRow;
  const sugg = (row.suggestions ?? {}) as Record<string, any>;
  const type = sugg.type as "INCOME" | "EXPENSE" | undefined;
  if (!type) throw new Error("Linha sem classificação INCOME/EXPENSE — revisar antes de aplicar");
  if (canonical.amount == null) throw new Error("Linha sem valor canônico");
  if (!canonical.transaction_date) throw new Error("Linha sem data canônica");

  const amount = Math.abs(canonical.amount);
  const { data: tx, error: txErr } = await sb
    .from("v3_financial_transactions")
    .insert({
      company_id: row.company_id,
      v3_row_id: row.id,
      type,
      category: type === "INCOME" ? "Receita importada" : "Despesa importada",
      description: canonical.description ?? "(sem descrição)",
      amount,
      transaction_date: canonical.transaction_date,
      client_id: row.resolved_client_id,
      service_id: row.resolved_service_id,
      notes: JSON.stringify({ canonical, suggestions: sugg }),
      engine: "v3",
    })
    .select("id")
    .single();
  if (txErr) throw new Error(txErr.message);

  await sb.from("v3_import_rows").update({
    status: "applied",
    applied_result: { transaction_id: tx.id, applied_at: new Date().toISOString() },
  }).eq("id", row.id);

  await sb.from("v3_audit_log").insert({
    import_id: row.import_id,
    row_id: row.id,
    company_id: row.company_id,
    stage: "persistence",
    event: "APPLY",
    input: { canonical, suggestions: sugg } as any,
    output: { transaction_id: tx.id } as any,
    reason: `Aplicado como ${type} no valor R$ ${amount}`,
  });

  return { ok: true };
}
