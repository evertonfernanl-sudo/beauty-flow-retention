export function normalizeDescription(desc: string | null | undefined): string | null {
  if (!desc) return null;
  
  let clean = desc.replace(/\s+/g, " ").trim();
  
  // OCR Cleanups
  clean = clean.replace(/\bP\s+X\s+receb\s+do\b/gi, "PIX RECEBIDO");
  clean = clean.replace(/\bP\s+X\s+enviado\b/gi, "PIX ENVIADO");
  clean = clean.replace(/\bP\s+X\b/gi, "PIX");
  clean = clean.replace(/\breceb\s+do\b/gi, "RECEBIDO");
  clean = clean.replace(/\btransf\b/gi, "TRANSFERÊNCIA");
  clean = clean.replace(/\bted\s+s\b/gi, "TED");
  clean = clean.replace(/\bdoc\s+s\b/gi, "DOC");
  
  return clean;
}
