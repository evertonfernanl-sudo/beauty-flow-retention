import type { CanonicalRow } from "../pipeline.server";
import { normalizeDescription } from "./descriptionNormalizer";
import { extractClient } from "./clientExtractor";
import { extractDate } from "./dateExtractor";
import { detectOperationType } from "./operationDetector";

export function enrichRow(c: CanonicalRow, bankName?: string): CanonicalRow {
  const enriched = { ...c };

  // 1. normalizeDescription (se aplica para padronizar espaçamentos/OCR)
  const normalizedDesc = normalizeDescription(enriched.description);
  if (normalizedDesc) {
    enriched.description = normalizedDesc;
  }

  // 2. extractClient (apenas se cliente estiver vazio/nulo)
  if (enriched.client_name == null || enriched.client_name === "") {
    const extracted = extractClient(enriched.description);
    if (extracted) {
      enriched.client_name = extracted;
    }
  }

  // 3. extractDate (apenas se data estiver vazia/nula)
  if (enriched.transaction_date == null || enriched.transaction_date === "") {
    if (c.transaction_date) {
      enriched.transaction_date = extractDate(c.transaction_date);
    }
  }

  // 4. detectOperation (apenas se tipo de movimentação estiver vazio/nulo)
  if (enriched.movement_type == null || enriched.movement_type === "") {
    const opType = detectOperationType(enriched.description);
    if (opType) {
      enriched.movement_type = opType;
    }
  }

  // Fallback de cliente: associa ao Banco do Extrato se continuar sem cliente
  if ((enriched.client_name == null || enriched.client_name === "") && bankName) {
    enriched.client_name = bankName;
  }

  return enriched;
}
