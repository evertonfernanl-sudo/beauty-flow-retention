export function sanitizeAuditText(text: string): string {
  if (!text) return "";
  let s = text;

  // Mask Emails
  s = s.replace(/\b([A-Za-z0-9._%+-]{1,3})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)\b/g, "$1***@$2");

  // Mask CPFs: 000.000.000-00
  s = s.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "***.***.***-**");
  // Mask CPFs raw: 11 digits
  s = s.replace(/\b\d{11}\b/g, "***********");

  // Mask CNPJs: 00.000.000/0000-00
  s = s.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "**.***.***/****-**");

  // Mask Bank Accounts (e.g. "Conta: 12345-6" or "Conta 123456")
  s = s.replace(/\b(conta|agencia|agência)\s*([0-9Xx-]{4,10})\b/gi, (match, p1, p2) => {
    const len = p2.length;
    const masked = len > 4 ? "*".repeat(len - 4) + p2.slice(-4) : "****";
    return `${p1} ${masked}`;
  });

  return s;
}
