export type ParsedMoney = {
  value: number | null;
  sign: "POSITIVE" | "NEGATIVE" | "ZERO" | "UNKNOWN";
  raw: string;
  reasonCode: string;
};

/**
 * Parses Brazilian/US currency formats and detects negative signs robustly.
 */
export function parseBrazilianMoney(value: unknown): ParsedMoney {
  if (value == null) {
    return { value: null, sign: "UNKNOWN", raw: "", reasonCode: "NULL_OR_UNDEFINED" };
  }
  
  const rawStr = String(value).trim();
  if (!rawStr) {
    return { value: null, sign: "UNKNOWN", raw: rawStr, reasonCode: "EMPTY_STRING" };
  }

  // 1. Detectar sinal negativo (ex: -100,00, R$ -100,00, (100,00), 100,00-, etc.)
  const hasMinusBeforeDigit = /-\s*\d/.test(rawStr);
  const hasMinusAtBeginningOrEnd = /^-|-$|[Dd]$/.test(rawStr.replace(/\s+/g, ""));
  const hasParentheses = /\(\s*\d+/.test(rawStr);
  const hasTrailingD = /\bD\b/i.test(rawStr.trim().slice(-3));

  const isNegative = hasMinusBeforeDigit || hasMinusAtBeginningOrEnd || hasParentheses || hasTrailingD;

  // 2. Limpeza do valor numérico
  let cleaned = rawStr
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/[\(\)]/g, "")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .replace(/[Dd]$/i, "");

  if (!cleaned) {
    return { value: null, sign: "UNKNOWN", raw: rawStr, reasonCode: "NO_DIGITS" };
  }

  const commas = (cleaned.match(/,/g) ?? []).length;
  const dots = (cleaned.match(/\./g) ?? []).length;
  let normalized: string;

  if (commas === 1 && dots >= 1) {
    // BR: "1.234,56"
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (dots >= 2 && commas === 0) {
    // BR sem centavos: "1.234.567"
    normalized = cleaned.replace(/\./g, "");
  } else if (commas === 1 && dots === 0) {
    // BR simplificado: "123,45"
    normalized = cleaned.replace(",", ".");
  } else if (dots === 1 && commas === 0) {
    // US padrão: "1234.56"
    normalized = cleaned;
  } else if (commas === 0 && dots === 0) {
    normalized = cleaned;
  } else {
    normalized = cleaned.replace(/,/g, "");
  }

  const numVal = Number(normalized);
  if (!Number.isFinite(numVal)) {
    return { value: null, sign: "UNKNOWN", raw: rawStr, reasonCode: "INVALID_NUMBER" };
  }

  const finalValue = isNegative && numVal > 0 ? -numVal : numVal;
  const sign = finalValue < 0 ? "NEGATIVE" : finalValue > 0 ? "POSITIVE" : "ZERO";

  return {
    value: finalValue,
    sign,
    raw: rawStr,
    reasonCode: "SUCCESS"
  };
}
