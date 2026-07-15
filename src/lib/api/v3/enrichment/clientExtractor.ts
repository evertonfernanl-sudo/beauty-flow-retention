import { CLIENT_BLACKLIST, CLIENT_PREFIXES, BANK_NAMES } from "./aliases";
import { TransactionPatternKey, isSystemPattern } from "./transactionPatternLibrary";

function stripPrefixes(desc: string): string {
  let clean = desc.trim();
  for (const p of CLIENT_PREFIXES) {
    clean = clean.replace(p, "");
  }
  return clean.trim();
}

function isInvalidClientName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (!lower) return true;

  // 1. Blacklist check
  if (CLIENT_BLACKLIST.some(w => lower === w || w.includes(lower))) return true;

  // 2. Banco check
  if (BANK_NAMES.some(b => lower === b || lower.includes(b))) return true;

  // 3. Agência / Conta / CPF / CNPJ check
  if (/\b(agencia|agência|conta|cpf|cnpj|bco|age|cta)\b/i.test(lower)) return true;
  if (/•••\.\d{3}\.\d{3}-••/i.test(lower)) return true;

  // 4. Apenas números ou caracteres especiais
  if (/^[^a-zA-ZÀ-ÿ]+$/.test(lower)) return true;

  return false;
}

export function cleanClientCandidate(candidate: string): string {
  let clean = candidate.trim();
  
  // 1. Remove qualquer data (ex: 06/07, 06/07/2026, 06-07)
  clean = clean.split(/\b\d{1,2}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?\b/)[0];
  
  // 2. Marcadores bancários/sistêmicos que devem terminar o nome do cliente quando
  //    aparecem NO MEIO/FINAL da string (não no início, pois no início são prefixos
  //    verbais tratados por stripPrefixes).
  const tailStopKeywords = [
    "pix enviado", "pix recebido", "ted enviada", "ted recebido", "doc enviado", "doc recebido",
    "banco", "agencia", "agência", "conta", "cpf", "cnpj", "chave", "comprovante",
    "valor", "tarifa"
  ];
  for (const kw of tailStopKeywords) {
    // Só corta se a keyword NÃO estiver no início da string (isto é, tem texto antes).
    const regex = new RegExp(`(.+?)\\s+\\b${kw}\\b.*`, "i");
    const m = clean.match(regex);
    if (m && m[1]) {
      clean = m[1];
    }
  }
  
  // 3. Keywords verbais/frasais só removem cauda se houver ao menos 2 palavras antes
  //    (evita apagar tudo em strings como "PAGAMENTO RD SAUDE" que já deveriam ter
  //    tido o prefixo removido, mas caem aqui por segurança).
  const verbTailKeywords = ["pagamento", "transferencia", "transferência"];
  for (const kw of verbTailKeywords) {
    const regex = new RegExp(`^(.+?\\s+\\S+)\\s+\\b${kw}\\b.*`, "i");
    const m = clean.match(regex);
    if (m && m[1]) {
      clean = m[1];
    }
  }
  
  // 4. Limpa caracteres residuais não alfabéticos do final
  clean = clean.replace(/[^A-Za-zÀ-ÿ\s'\.\-]+.*$/, "").trim();
  
  return clean;
}

export function extractClient(
  desc: string | null | undefined,
  pattern: TransactionPatternKey
): string | null {
  if (!desc) return null;

  // Se for operação sistêmica, não há cliente externo (retorna null para fallback de banco emissor)
  if (isSystemPattern(pattern)) {
    return null;
  }

  // Normalização de múltiplos espaços
  const clean = desc.replace(/\s+/g, " ").trim();

  // 1) Marcadores explícitos na descrição (Bradesco, Nubank, etc.)
  const markerRegex = /\b(?:favorecido|destinat[aá]rio|recebedor|pagador|benefici[aá]rio|fav|nome|des|rem)\s*[:\-]\s*([^;,\n]+)/i;
  const explicitMarkerMatch = clean.match(markerRegex);
  if (explicitMarkerMatch && explicitMarkerMatch[1]) {
    const rawCandidate = explicitMarkerMatch[1].trim();
    const candidate = cleanClientCandidate(rawCandidate);
    if (candidate) {
      const words = candidate.split(/\s+/).filter((w) => w.length > 1);
      const validWords = words.filter((w) => !isInvalidClientName(w));
      if (validWords.length >= 2) {
        return candidate;
      }
    }
  }

  // 2) Quebra por "-" se presente (padrão muito comum)
  const parts = clean
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  
  if (parts.length >= 2) {
    for (const part of parts) {
      const strippedPart = cleanClientCandidate(stripPrefixes(part));
      if (strippedPart) {
        const words = strippedPart.split(/\s+/).filter((w) => w.length > 1);
        const validWords = words.filter((w) => !isInvalidClientName(w));
        if (validWords.length >= 2) {
          return strippedPart;
        }
      }
    }
  }

  // 3) Tenta casar nome limpo após remoção de prefixo da descrição toda
  const strippedDesc = cleanClientCandidate(stripPrefixes(clean));
  if (strippedDesc) {
    const words = strippedDesc.split(/\s+/);
    if (words.length >= 2) {
      const validWords = words.filter((w) => w.length >= 2 && !isInvalidClientName(w));
      if (validWords.length >= 2) {
        return strippedDesc;
      }
    }
  }

  // 4) Se sobrou nome de empresa com números/barras (ex: ASSAI ATACADISTA 06.057.223/0001-71)
  const docOrBankMatch = clean.match(/^([A-Za-zÀ-ÿ\s'\.\-&]{4,60})(?:\s+-\s+|\s+[\d•\-\.\/]+|$)/);
  if (docOrBankMatch && docOrBankMatch[1]) {
    const candidate = cleanClientCandidate(stripPrefixes(docOrBankMatch[1]));
    if (candidate) {
      const words = candidate.split(/\s+/).filter((w) => w.length >= 2);
      const validWords = words.filter((w) => !isInvalidClientName(w));
      if (validWords.length >= 2) {
        return candidate;
      }
    }
  }

  return null;
}
