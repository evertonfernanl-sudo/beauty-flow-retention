export function normalizeHeader(text: string): string {
  if (text == null) return "";
  
  let s = String(text);
  
  // 1. Unicode Normalization (NFD)
  s = s.normalize("NFD");
  
  // 2. Remove diacritics/accents
  s = s.replace(/[\u0300-\u036f]/g, "");
  
  // 3. Strip currency suffixes and symbols from the end of the string (e.g. " (R$)", " R$", " (BRL)", ":")
  s = s.replace(/[\s\(\[\:\/\-–]+(r\$|brl|cx|d|c|\d+)?\)?\s*$/gi, "");
  
  // 4. Remove non-alphanumeric special characters (leaving spaces, slashes and dashes)
  s = s.replace(/[^A-Za-z0-9\s\/\-\._]/g, " ");
  
  // 5. Correct OCR typos/noisy characters in keywords
  s = s.replace(/descri[cç]ao/gi, "descricao");
  s = s.replace(/descri[cç]ao/gi, "descricao");
  s = s.replace(/descri[cç]Ao/gi, "descricao");
  s = s.replace(/historico/gi, "historico");
  s = s.replace(/lancamento/gi, "lancamento");
  s = s.replace(/transacao/gi, "transacao");
  s = s.replace(/operacao/gi, "operacao");
  s = s.replace(/observacao/gi, "observacao");
  
  // 6. Collapse spaces, trim and lowercase
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
