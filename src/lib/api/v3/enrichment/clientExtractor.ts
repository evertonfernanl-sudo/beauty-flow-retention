import { BLACKLIST_CLIENT_WORDS, REGEX_PATTERNS } from "./aliases";

function isSystemTransaction(desc: string): boolean {
  const clean = desc.toLowerCase().trim();
  const systemKeywords = [
    "resgate",
    "aplicacao",
    "aplicação",
    "rendimento",
    "juros",
    "tarifa",
    "taxa",
    "imposto",
    "iof",
    "tributo",
    "saldo",
    "extrato",
    "emprestimo",
    "empréstimo",
    "credito em conta",
    "crédito em conta",
    "valor adicionado"
  ];
  return systemKeywords.some(kw => clean.includes(kw));
}

function stripPrefixes(name: string): string {
  let clean = name.trim();
  const prefixes = [
    /^transfer[êe]ncia\s+recebida\s+pelo\s+pix\s*/i,
    /^transfer[êe]ncia\s+enviada\s+pelo\s+pix\s*/i,
    /^transfer[êe]ncia\s+recebida\s+de\s*/i,
    /^transfer[êe]ncia\s+enviada\s+para\s*/i,
    /^transfer[êe]ncia\s+recebida\s*/i,
    /^transfer[êe]ncia\s+enviada\s*/i,
    /^pagamento\s+de\s+boleto\s+efetuado\s*/i,
    /^pagamento\s+de\s+boleto\s*/i,
    /^pagamento\s+efetuado\s*/i,
    /^pix\s+recebido\s+de\s*/i,
    /^pix\s+enviado\s+para\s*/i,
    /^pix\s+recebido\s*/i,
    /^pix\s+enviado\s*/i,
    /^compra\s+no\s+d[eé]bito\s*/i,
    /^compra\s+no\s+cr[eé]dito\s*/i,
    /^compra\s*/i,
    /^saque\s+de\s*/i,
    /^saque\s*/i,
  ];
  for (const p of prefixes) {
    clean = clean.replace(p, "");
  }
  return clean.trim();
}

export function extractClient(desc: string | null | undefined): string | null {
  if (!desc) return null;

  if (isSystemTransaction(desc)) {
    return null;
  }

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
      const strippedPart = stripPrefixes(part);
      if (nameRegex.test(strippedPart)) {
        const words = strippedPart.split(/\s+/).filter((w) => w.length > 1);
        const validWords = words.filter((w) => !isBlacklisted(w));
        if (validWords.length >= 2) {
          return strippedPart;
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
      const strippedCandidate = stripPrefixes(candidate);
      const words = strippedCandidate.split(/\s+/).filter((w) => w.length >= 2);
      const validWords = words.filter((w) => !isBlacklisted(w));
      if (validWords.length >= 2) {
        return strippedCandidate;
      }
    }
  }

  // 3) Fallback: se for uma sequência de 2 a 4 palavras capitalizadas
  const strippedClean = stripPrefixes(clean);
  const words = strippedClean.split(/\s+/);
  if (words.length >= 2 && words.length <= 4) {
    const nameRegex = /^[A-Za-zÀ-ÿ\s'\.\-]+$/;
    if (nameRegex.test(strippedClean)) {
      const validWords = words.filter((w) => w.length >= 2 && !isBlacklisted(w));
      if (validWords.length >= 2) {
        return strippedClean;
      }
    }
  }

  return null;
}
