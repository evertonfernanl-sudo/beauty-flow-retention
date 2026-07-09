// NTIEB Cap. 55 — Validação de saldo (SI + ΣReceitas − ΣDespesas ≈ SF)
// NTIEB Cap. 15.3 — Captura de linhas neutras (Saldo Inicial, Saldo Final, Totais)
// NTIEB Cap. 56–59 — Validações pós-parse por linha

import { formatRuleApplied } from "../ntieb/rules";

export type ExtractSummary = {
  saldoInicial: number | null;
  saldoFinal: number | null;
  totalEntradas: number | null;
  totalSaidas: number | null;
};

// Regex para reconhecer linhas neutras específicas
const RE_SALDO_INICIAL = /\b(saldo\s+(inicial|anterior))\b/i;
const RE_SALDO_FINAL = /\b(saldo\s+(final|atual))\b/i;
const RE_TOTAL_ENTRADAS = /\b(total\s+(de\s+)?(cr[eé]ditos|entradas))\b/i;
const RE_TOTAL_SAIDAS = /\b(total\s+(de\s+)?(d[eé]bitos|sa[ií]das))\b/i;

function parseNumeric(s: string): number | null {
  if (!s) return null;
  const t = String(s).replace(/[^\d,.\-]/g, "").replace(/^-/, "").replace(/-$/, "");
  if (!t) return null;
  const commas = (t.match(/,/g) ?? []).length;
  const dots = (t.match(/\./g) ?? []).length;
  let normalized: string;
  if (commas === 1 && dots >= 1) normalized = t.replace(/\./g, "").replace(",", ".");
  else if (commas === 1 && dots === 0) normalized = t.replace(",", ".");
  else normalized = t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// Percorre linhas cruas (antes do filtro de summary) e captura os valores neutros.
export function captureExtractSummary(rawRows: string[][]): ExtractSummary {
  const s: ExtractSummary = { saldoInicial: null, saldoFinal: null, totalEntradas: null, totalSaidas: null };

  for (const row of rawRows) {
    const line = row.map((c) => String(c ?? "")).join(" ").trim();
    if (!line) continue;

    // Pega o último token numérico da linha como valor associado.
    const numTokens = row
      .map((c) => parseNumeric(String(c ?? "")))
      .filter((n): n is number => n != null);
    const lastNum = numTokens.length > 0 ? numTokens[numTokens.length - 1] : null;
    if (lastNum == null) continue;

    if (s.saldoInicial == null && RE_SALDO_INICIAL.test(line)) s.saldoInicial = lastNum;
    if (RE_SALDO_FINAL.test(line)) s.saldoFinal = lastNum; // sempre pega o último ocorrido
    if (s.totalEntradas == null && RE_TOTAL_ENTRADAS.test(line)) s.totalEntradas = Math.abs(lastNum);
    if (s.totalSaidas == null && RE_TOTAL_SAIDAS.test(line)) s.totalSaidas = Math.abs(lastNum);
  }

  return s;
}

// NTIEB Cap. 55 — validação da fórmula. Tolerância R$ 0,01.
export type BalanceValidation = {
  applicable: boolean;
  valid: boolean | null;
  delta: number | null;
  expectedFinal: number | null;
  rule_applied: string;
  reason: string;
};

export function validateBalance(
  summary: ExtractSummary,
  totals: { income: number; expense: number },
): BalanceValidation {
  const rule_applied = formatRuleApplied("55", "SI + ΣReceitas − ΣDespesas ≈ SF");
  if (summary.saldoInicial == null || summary.saldoFinal == null) {
    return {
      applicable: false,
      valid: null,
      delta: null,
      expectedFinal: null,
      rule_applied,
      reason: "Saldo inicial ou saldo final não localizados no extrato",
    };
  }
  const expected = summary.saldoInicial + totals.income - totals.expense;
  const delta = Number((expected - summary.saldoFinal).toFixed(2));
  const valid = Math.abs(delta) <= 0.01;
  return {
    applicable: true,
    valid,
    delta,
    expectedFinal: Number(expected.toFixed(2)),
    rule_applied,
    reason: valid
      ? "Fórmula de saldo fecha dentro da tolerância R$ 0,01"
      : `Divergência de R$ ${delta.toFixed(2)} entre esperado (${expected.toFixed(2)}) e saldo final (${summary.saldoFinal.toFixed(2)})`,
  };
}
