import { detectHeader } from "./headerDetector";
import { matchCell } from "./headerMatcher";
import { CanonicalHeader, FieldMap } from "./types";

export { detectHeader } from "./headerDetector";
export { normalizeHeader } from "./headerNormalizer";
export { matchCell } from "./headerMatcher";
export { isSummaryOrBalanceRow } from "./ignoredRows";
export * from "./types";

// Concatenação especial Histórico + Complemento
const HISTORICO_RE = /^(hist[oó]rico)$/i;
const COMPLEMENTO_RE = /^(complemento)$/i;

export function mapHeaders(headers: string[]): {
  map: FieldMap;
  reasons: string[];
  extraConcat?: { field: CanonicalHeader; cols: [string, string] };
} {
  const map: FieldMap = {};
  const used = new Set<string>();
  const reasons: string[] = [];

  // 1. Concatenação especial Histórico + Complemento
  const histIdx = headers.findIndex((h) => HISTORICO_RE.test(h));
  const compIdx = headers.findIndex((h) => COMPLEMENTO_RE.test(h));
  let extraConcat: { field: CanonicalHeader; cols: [string, string] } | undefined;
  if (histIdx >= 0 && compIdx >= 0) {
    map.description = headers[histIdx];
    used.add(headers[histIdx]);
    used.add(headers[compIdx]);
    extraConcat = { field: "description", cols: [headers[histIdx], headers[compIdx]] };
    reasons.push(`description=${headers[histIdx]} + ${headers[compIdx]} (concatenados com " - ")`);
  }

  // 2. Mapeamento usando o Matcher estruturado em 4 níveis
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (used.has(h)) continue;
    
    const clean = h.trim();
    if (!clean) continue;
    
    const match = matchCell(clean);
    if (match) {
      const field = match.field;
      if (!map[field]) {
        map[field] = h;
        used.add(h);
        reasons.push(`${field}=${h} (Match: ${match.level}, Confiança: ${(match.confidence * 100).toFixed(0)}%)`);
      }
    }
  }

  // 3. Se apenas uma coluna de valor específica foi mapeada (debit_amount ou credit_amount),
  // e nenhuma coluna geral de amount foi mapeada, ela deve ser tratada como amount (preservando o sinal)
  if (!map.amount) {
    if (map.credit_amount && !map.debit_amount) {
      map.amount = map.credit_amount;
      reasons.push(`re-mapeamento: credit_amount (${map.credit_amount}) promovido a amount pois não há coluna de débito correspondente`);
      delete map.credit_amount;
    } else if (map.debit_amount && !map.credit_amount) {
      map.amount = map.debit_amount;
      reasons.push(`re-mapeamento: debit_amount (${map.debit_amount}) promovido a amount pois não há coluna de crédito correspondente`);
      delete map.debit_amount;
    }
  }

  // Fallback: Se "transaction_date" não foi mapeado, mas temos "description" mapeado,
  // associa "transaction_date" ao mesmo cabeçalho de "description" para permitir extração inline.
  if (!map.transaction_date && map.description) {
    map.transaction_date = map.description;
    reasons.push(`transaction_date=${map.description} (Fallback: mapeado para a coluna de descrição pois não havia coluna de data dedicada)`);
  }

  return { map, reasons, extraConcat };
}
