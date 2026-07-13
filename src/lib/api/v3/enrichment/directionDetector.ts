import type { CanonicalRow } from "../pipeline.server";
import { TransactionPatternKey } from "./transactionPatternLibrary";

export function detectDirection(
  c: CanonicalRow,
  pattern: TransactionPatternKey
): "INCOME" | "EXPENSE" | null {
  // 1. Colunas estruturais (quando apenas uma das duas colunas está preenchida)
  const hasDebit = c.debit_amount != null && c.debit_amount > 0;
  const hasCredit = c.credit_amount != null && c.credit_amount > 0;
  if (hasDebit && !hasCredit) {
    return "EXPENSE";
  }
  if (hasCredit && !hasDebit) {
    return "INCOME";
  }

  // 2. Sinal monetário confiável (valor negativo sempre indica despesa)
  if (c.amount != null && c.amount < 0) {
    return "EXPENSE";
  }

  // 3 e 4. Operações semânticas e regras sistêmicas (padrão identificado)
  if (pattern) {
    const expensePatterns = [
      "PIX_SENT",
      "SYSTEM_RDB_APPLICATION",
      "SYSTEM_LOAN",
      "SYSTEM_FEE",
      "TED_SENT",
      "DOC_SENT",
      "BOLETO_PAYMENT",
      "CARD_SHOPPING",
      "CARD_PAYMENT",
      "TRANSFER_SENT",
      "WITHDRAWAL"
    ];
    if (expensePatterns.includes(pattern)) {
      return "EXPENSE";
    }

    const incomePatterns = [
      "PIX_RECEIVED",
      "SYSTEM_RDB_REDEMPTION",
      "SYSTEM_CREDIT_IN_ACCOUNT",
      "SYSTEM_LOAN_REDEMPTION",
      "SYSTEM_RENDIMENTO",
      "TED_RECEIVED",
      "DOC_RECEIVED",
      "TRANSFER_RECEIVED",
      "DEPOSIT"
    ];
    if (incomePatterns.includes(pattern)) {
      return "INCOME";
    }
  }

  // 5. Fallback final (sinal positivo apenas quando nenhuma evidência anterior existir)
  if (c.amount != null && c.amount > 0) {
    return "INCOME";
  }

  return null;
}
