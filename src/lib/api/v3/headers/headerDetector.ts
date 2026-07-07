import { HeaderDetectionResult, CanonicalHeader, HeaderMatch } from "./types";
import { scoreRow } from "./headerScore";
import { matchCell } from "./headerMatcher";
import { isIgnoredRow } from "./ignoredRows";

export function detectHeader(matrix: string[][], source?: string): HeaderDetectionResult {
  let bestIdx = -1;
  let bestScore = 0;
  let bestConfidence = 0;
  let bestMatches = new Map<string, HeaderMatch>();
  
  // Limite deslizante de busca de até 25 linhas
  const limit = Math.min(matrix.length, 25);
  
  for (let i = 0; i < limit; i++) {
    const row = matrix[i];
    if (!row || row.length === 0) continue;
    
    // Converte a linha inteira em strings para verificação
    const cells = row.map(c => String(c ?? "").trim());
    
    // Ignora linhas classificadas como ruído ou saldo (ignoredRows)
    if (isIgnoredRow(cells)) {
      continue;
    }
    
    const matches = new Map<string, HeaderMatch>();
    cells.forEach(cell => {
      if (!cell) return;
      const m = matchCell(cell);
      if (m) {
        matches.set(cell, m);
      }
    });
    
    // Regra: Deve conter pelo menos 2 campos mapeados únicos para ser considerado cabeçalho
    const uniqueFields = new Set(Array.from(matches.values()).map(m => m.field));
    if (uniqueFields.size < 2) continue;
    
    const { score, confidence } = scoreRow(matches);
    
    if (score > bestScore) {
      bestScore = score;
      bestConfidence = confidence;
      bestIdx = i;
      bestMatches = matches;
    }
  }
  
  // Se a melhor linha tiver confiança inferior a 60%, rejeitamos como HEADER_NOT_CONFIDENT
  if (bestIdx < 0 || bestConfidence < 0.60) {
    return {
      headerIndex: -1,
      score: bestScore,
      confidence: bestConfidence,
      headers: [],
      matchedFields: {},
      headerFailed: true
    };
  }
  
  const selectedRow = matrix[bestIdx].map(c => String(c ?? "").trim());
  const matchedFields: Record<string, string> = {};
  
  bestMatches.forEach((match, rawCell) => {
    matchedFields[match.field] = rawCell;
  });
  
  return {
    headerIndex: bestIdx,
    score: bestScore,
    confidence: bestConfidence,
    headers: selectedRow,
    matchedFields
  };
}
