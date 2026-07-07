import type { CanonicalRow } from "../pipeline.server";
import { TransactionPatternKey, isSystemPattern } from "./transactionPatternLibrary";
import { BANK_NAMES } from "./aliases";

export function validateCanonicalConsistency(
  c: CanonicalRow,
  pattern: TransactionPatternKey,
  bankName?: string
): CanonicalRow {
  const validated = { ...c };

  // 1. Rejeita clientes falsos ou genéricos
  if (validated.client_name) {
    const cleanClient = validated.client_name.trim().toLowerCase();
    const invalidKeywords = ["pix", "transferência", "transferencia", "ted", "doc", "conta", "agência", "agencia", "banco", "beneficiario", "beneficiário", "pagamento"];
    if (invalidKeywords.includes(cleanClient)) {
      validated.client_name = null;
    }
  }

  // 2. Se for operação de sistema e o cliente estiver vazio, preenche com o banco emissor
  const system = isSystemPattern(pattern);
  if (system && (validated.client_name == null || validated.client_name === "")) {
    validated.client_name = bankName ? `banco ${bankName.toLowerCase().trim()}` : "banco emissor";
  }

  // 3. Fallback de coerência de direção de acordo com o padrão
  if (pattern) {
    // Se o padrão for de envio (despesa), garante que o amount reflita despesa se não estiver explícito
    if (pattern.endsWith("_SENT") || pattern === "BOLETO_PAYMENT" || pattern === "SYSTEM_RDB_APPLICATION" || pattern === "SYSTEM_LOAN" || pattern === "SYSTEM_FEE" || pattern === "WITHDRAWAL") {
      if (validated.amount != null && validated.amount > 0 && validated.debit_amount == null && validated.credit_amount == null) {
        validated.amount = -Math.abs(validated.amount);
      }
    }
  }

  return validated;
}
