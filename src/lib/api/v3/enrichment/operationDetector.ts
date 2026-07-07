export function detectOperationType(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const s = desc.toLowerCase();
  if (/\bpix\b/i.test(s)) return "PIX";
  if (/\b(cartao|cartão|credit|debito|débito|card)\b/i.test(s)) return "CARD";
  if (/\b(dinheiro|cash|especie|espécie)\b/i.test(s)) return "CASH";
  if (/\b(transferencia|transferência|ted|doc|transf)\b/i.test(s)) return "TRANSFER";
  if (/\bboleto\b/i.test(s)) return "BOLETO";
  return null;
}
