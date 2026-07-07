import { BLACKLIST_CLIENT_WORDS, REGEX_PATTERNS } from "./aliases";

export function extractClient(desc: string | null | undefined): string | null {
  if (!desc) return null;

  const clean = desc.replace(/\s+/g, " ").trim();

  const isBlacklisted = (word: string): boolean => {
    const w = word.toLowerCase().trim();
    return BLACKLIST_CLIENT_WORDS.some(bl => w === bl || bl.includes(w));
  };

  // 1) Quebra por "-" se presente (ex: "PIX RECEBIDO - MARIA SILVA" ou "Transferência enviada - JOÃO DA SILVA")
  const parts = clean
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const nameRegex = /^[A-Za-zÀ-ÿ\s'\.\-]+$/;
    for (const part of parts) {
      if (nameRegex.test(part)) {
        const words = part.split(/\s+/).filter((w) => w.length > 1);
        const validWords = words.filter((w) => !isBlacklisted(w));
        if (validWords.length >= 2) {
          return part;
        }
      }
    }
  }

  // 2) Padrões com limites explícitos de nomes
  for (const re of REGEX_PATTERNS) {
    const match = clean.match(re);
    if (match && match[1]) {
      let candidate = match[1].trim();
      candidate = candidate.replace(/\s+\d{2}\/\d{2}$/, "").replace(/\s+\d{4}$/, "").trim();
      const words = candidate.split(/\s+/).filter((w) => w.length >= 2);
      const validWords = words.filter((w) => !isBlacklisted(w));
      if (validWords.length >= 2) {
        return validWords.join(" ");
      }
    }
  }

  // 3) Fallback: se for uma sequência de 2 a 4 palavras capitalizadas
  const words = clean.split(/\s+/);
  if (words.length >= 2 && words.length <= 4) {
    const nameRegex = /^[A-Za-zÀ-ÿ\s'\.\-]+$/;
    if (nameRegex.test(clean)) {
      const validWords = words.filter((w) => w.length >= 2 && !isBlacklisted(w));
      if (validWords.length >= 2) {
        return clean;
      }
    }
  }

  return null;
}
