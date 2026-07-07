import type { CanonicalRow } from "../pipeline.server";
import { EXPENSE_KEYWORDS, INCOME_KEYWORDS } from "./aliases";

export function detectDirection(c: CanonicalRow): "INCOME" | "EXPENSE" | null {
  const desc = (c.description ?? "").toLowerCase();

  // 1. Descrição indica despesa (aliases)
  if (EXPENSE_KEYWORDS.some(kw => desc.includes(kw))) {
    return "EXPENSE";
  }

  // 2. Descrição indica receita (aliases)
  if (INCOME_KEYWORDS.some(kw => desc.includes(kw))) {
    return "INCOME";
  }

  // 3. Coluna Débito preenchida e não zerada
  if (c.debit_amount != null && c.debit_amount !== 0) {
    return "EXPENSE";
  }

  // 4. Coluna Crédito preenchida e não zerada
  if (c.credit_amount != null && c.credit_amount !== 0) {
    return "INCOME";
  }

  // 5. Valor com sinal negativo
  if (c.amount != null && c.amount < 0) {
    return "EXPENSE";
  }

  // 6. Valor com sinal positivo
  if (c.amount != null && c.amount > 0) {
    return "INCOME";
  }

  return null;
}
