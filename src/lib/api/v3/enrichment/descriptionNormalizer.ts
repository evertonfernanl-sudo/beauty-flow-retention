export function normalizeDescription(desc: string | null | undefined): string | null {
  if (!desc) return null;
  
  // Normalização Unicode e remoção de acentos
  let clean = desc.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Caixa baixa e limpeza de múltiplos espaços
  clean = clean.toLowerCase().replace(/\s+/g, " ").trim();
  
  // Correções OCR mais comuns
  clean = clean.replace(/\bp\s+x\s+receb\s+do\b/g, "pix recebido");
  clean = clean.replace(/\bp\s+x\s+enviado\b/g, "pix enviado");
  clean = clean.replace(/\bp\s+x\b/g, "pix");
  clean = clean.replace(/\breceb\s+do\b/g, "recebido");
  clean = clean.replace(/\btransf\b/g, "transferencia");
  clean = clean.replace(/\bted\s+s\b/g, "ted");
  clean = clean.replace(/\bdoc\s+s\b/g, "doc");
  
  return clean;
}
