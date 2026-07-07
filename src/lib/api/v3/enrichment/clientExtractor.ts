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

  // 1) Quebra por "-" se presente (padrão muito comum)
  const parts = clean
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  
  if (parts.length >= 2) {
    const nameRegex = /^[A-Za-zÀ-ÿ\s'\.\-]+$/;
    for (const part of parts) {
      const strippedPart = stripPrefixes(part);
      if (nameRegex.test(strippedPart)) {
        const words = strippedPart.split(/\s+/).filter((w) => w.length > 1);
        const validWords = words.filter((w) => !isInvalidClientName(w));
        if (validWords.length >= 2) {
          return strippedPart;
        }
      }
    }
  }

  // 2) Tenta casar nome limpo após remoção de prefixo da descrição toda
  const strippedDesc = stripPrefixes(clean);
  const words = strippedDesc.split(/\s+/);
  if (words.length >= 2) {
    const nameRegex = /^[A-Za-zÀ-ÿ\s'\.\-]+$/;
    if (nameRegex.test(strippedDesc)) {
      const validWords = words.filter((w) => w.length >= 2 && !isInvalidClientName(w));
      if (validWords.length >= 2) {
        return strippedDesc;
      }
    }
  }

  // 3) Se sobrou nome de empresa com números/barras (ex: ASSAI ATACADISTA 06.057.223/0001-71)
  const docOrBankMatch = clean.match(/^([A-Za-zÀ-ÿ\s'\.\-&]{4,60})(?:\s+-\s+|\s+[\d•\-\.\/]+|$)/);
  if (docOrBankMatch && docOrBankMatch[1]) {
    const candidate = stripPrefixes(docOrBankMatch[1]);
    const words = candidate.split(/\s+/).filter((w) => w.length >= 2);
    const validWords = words.filter((w) => !isInvalidClientName(w));
    if (validWords.length >= 2) {
      return candidate;
    }
  }

  return null;
}
