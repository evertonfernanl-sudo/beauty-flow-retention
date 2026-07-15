import { CanonicalHeader, HeaderMatch } from "./types";
import { ALIASES } from "./aliases";
import { normalizeHeader } from "./headerNormalizer";

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

export function matchCell(cell: string): HeaderMatch | null {
  const trimmed = cell.trim();
  const lower = trimmed.toLowerCase();
  
  if (!lower) return null;

  // 1. EXACT Match (including canonical fields directly)
  for (const [field, config] of Object.entries(ALIASES)) {
    const isExactCanonical = 
      field.toLowerCase() === lower || 
      field.replace(/_/g, "").toLowerCase() === lower ||
      field.replace(/_amount$/, "").toLowerCase() === lower ||
      field.replace(/_number$/, "").toLowerCase() === lower ||
      field.replace(/_date$/, "").toLowerCase() === lower;
      
    if (isExactCanonical || config.aliases.some(alias => alias.toLowerCase() === lower)) {
      return {
        field: field as CanonicalHeader,
        level: "EXACT",
        aliasMatched: lower,
        confidence: 1.0
      };
    }
  }
  
  // 2. REGEX Match
  for (const [field, config] of Object.entries(ALIASES)) {
    if (config.regex) {
      for (const re of config.regex) {
        if (re.test(trimmed)) {
          return {
            field: field as CanonicalHeader,
            level: "REGEX",
            aliasMatched: trimmed,
            confidence: 0.95
          };
        }
      }
    }
  }
  
  // 3. NORMALIZED Match
  const normalizedCell = normalizeHeader(cell);
  if (normalizedCell) {
    for (const [field, config] of Object.entries(ALIASES)) {
      if (config.aliases.some(alias => normalizeHeader(alias) === normalizedCell)) {
        return {
          field: field as CanonicalHeader,
          level: "NORMALIZED",
          aliasMatched: normalizedCell,
          confidence: 0.90
        };
      }
    }
  }
  
  // 4. FUZZY Match (Levenshtein distance <= 1 or similarity ratio >= 0.8)
  if (normalizedCell && normalizedCell.length >= 3) {
    for (const [field, config] of Object.entries(ALIASES)) {
      for (const alias of config.aliases) {
        const normAlias = normalizeHeader(alias);
        if (normAlias.length < 3) continue;
        
        const dist = getLevenshteinDistance(normalizedCell, normAlias);
        const maxLen = Math.max(normalizedCell.length, normAlias.length);
        const similarity = 1 - dist / maxLen;
        
        if (similarity >= 0.8 || dist <= 1) {
          return {
            field: field as CanonicalHeader,
            level: "FUZZY",
            aliasMatched: alias,
            confidence: 0.80 * similarity
          };
        }
      }
    }
  }
  
  return null;
}
