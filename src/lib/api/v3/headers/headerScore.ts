import { CanonicalHeader, HeaderMatch } from "./types";

export const FIELD_WEIGHTS: Record<CanonicalHeader, number> = {
  transaction_date: 10,
  amount: 10,
  debit_amount: 10,
  credit_amount: 10,
  description: 8,
  balance: 6,
  client_name: 4,
  phone: 1,
  email: 1,
  document_number: 2,
  cpf_cnpj: 2,
  movement_type: 3,
  raw_extra: 0
};

export function scoreRow(matches: Map<string, HeaderMatch>): { score: number; confidence: number } {
  let totalScore = 0;
  const seenFields = new Set<CanonicalHeader>();
  
  matches.forEach(match => {
    if (!seenFields.has(match.field)) {
      seenFields.add(match.field);
      // Pondera pelo peso do campo e confiança do match (EXACT/REGEX/NORMALIZED/FUZZY)
      totalScore += FIELD_WEIGHTS[match.field] * match.confidence;
    }
  });
  
  // Confiança com base na presença dos campos essenciais:
  // - Data da transação (peso: 35%)
  // - Descrição (peso: 30%)
  // - Pelo menos uma coluna de Valor (Valor Único, Débito ou Crédito) (peso: 35%)
  const hasDate = seenFields.has("transaction_date");
  const hasDesc = seenFields.has("description");
  const hasAmount = seenFields.has("amount") || seenFields.has("debit_amount") || seenFields.has("credit_amount");
  
  let confidence = 0;
  if (hasDate) confidence += 0.35;
  if (hasDesc) confidence += 0.30;
  if (hasAmount) confidence += 0.35;
  
  return { score: totalScore, confidence };
}
