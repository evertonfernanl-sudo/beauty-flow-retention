import { TransactionPatternKey } from "./transactionPatternLibrary";

export function detectOperation(
  desc: string | null | undefined,
  pattern: TransactionPatternKey
): string | null {
  if (pattern) {
    if (pattern.startsWith("PIX_")) return "PIX";
    if (pattern.startsWith("TED_")) return "TRANSFER";
    if (pattern.startsWith("DOC_")) return "TRANSFER";
    if (pattern.startsWith("TRANSFER_")) return "TRANSFER";
    if (pattern.startsWith("CARD_")) return "CARD";
    if (pattern === "BOLETO_PAYMENT") return "BOLETO";
    if (pattern === "WITHDRAWAL") return "CASH";
    if (pattern === "DEPOSIT") return "CASH";
    if (pattern.startsWith("SYSTEM_")) return "SYSTEM";
  }

  // Fallback para aliases
  if (!desc) return null;
  const s = desc.toLowerCase();
  if (/\bpix\b/i.test(s)) return "PIX";
  if (/\b(cartao|cartão|credit|debito|débito|card)\b/i.test(s)) return "CARD";
  if (/\b(dinheiro|cash|especie|espécie)\b/i.test(s)) return "CASH";
  if (/\b(transferencia|transferência|ted|doc|transf)\b/i.test(s)) return "TRANSFER";
  if (/\bboleto\b/i.test(s)) return "BOLETO";
  return null;
}
