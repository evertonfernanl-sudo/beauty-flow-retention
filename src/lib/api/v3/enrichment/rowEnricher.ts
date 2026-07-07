import type { CanonicalRow } from "../pipeline.server";
import { normalizeDescription } from "./descriptionNormalizer";
import { detectTransactionPattern } from "./transactionPatternLibrary";
import { extractClient } from "./clientExtractor";
import { extractDate } from "./dateExtractor";
import { detectOperation } from "./operationDetector";
import { detectDirection } from "./directionDetector";
import { validateCanonicalConsistency } from "./consistencyValidator";

export function enrichRow(c: CanonicalRow, bankName?: string): CanonicalRow {
  let enriched = { ...c };

  // 1. Normalizar descrição para análise (descrição original preservada no enriched.description)
  const normalizedDesc = normalizeDescription(enriched.description);

  // 2. Identificar padrão estrutural
  const pattern = detectTransactionPattern(normalizedDesc);

  // 3. Extrair cliente (apenas se estiver vazio)
  if (enriched.client_name == null || enriched.client_name === "") {
    const client = extractClient(enriched.description, pattern);
    if (client) {
      enriched.client_name = client;
    }
  }

  // 4. Extrair data (apenas se estiver vazia)
  if (enriched.transaction_date == null || enriched.transaction_date === "") {
    if (c.transaction_date) {
      enriched.transaction_date = extractDate(c.transaction_date);
    }
  }

  // 5. Detectar tipo de operação (apenas se estiver vazio)
  if (enriched.movement_type == null || enriched.movement_type === "") {
    const op = detectOperation(enriched.description, pattern);
    if (op) {
      enriched.movement_type = op;
    }
  }

  // 6. Detectar direção (sempre computado para alimentar o classificador)
  // O consistencyValidator e classify cuidarão de manter a coerência final.
  
  // 7. Validar consistência da CanonicalRow inteira (aplica correções finais)
  enriched = validateCanonicalConsistency(enriched, pattern, bankName);

  return enriched;
}
