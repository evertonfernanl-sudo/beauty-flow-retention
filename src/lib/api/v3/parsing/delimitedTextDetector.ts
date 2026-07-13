export type SupportedDelimiter = ";" | "," | "\t" | "|";

export type DelimiterDetectionResult = {
  delimiter: SupportedDelimiter | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  expectedColumnCount: number | null;
  reasonCode: string;
};

/**
 * Splits a CSV line by a delimiter, respecting double quotes.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

const COMMON_HEADER_WORDS = [
  "data", "descri", "hist", "valor", "saldo", "doc", "lança", "favorecido", "cpf", "cnpj", "cliente", "conta"
];

export function detectDelimitedTextStructure(text: string): DelimiterDetectionResult {
  if (!text || !text.trim()) {
    return {
      delimiter: null,
      confidence: "LOW",
      expectedColumnCount: null,
      reasonCode: "EMPTY_TEXT"
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return {
      delimiter: null,
      confidence: "LOW",
      expectedColumnCount: null,
      reasonCode: "NO_VALID_LINES"
    };
  }

  // Analisar no máximo as primeiras 25 linhas significativas
  const sampleLines = lines.slice(0, 25);
  const candidates: SupportedDelimiter[] = [";", ",", "\t", "|"];
  
  let bestDelimiter: SupportedDelimiter | null = null;
  let bestConfidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  let bestColumnCount: number | null = null;
  let bestReasonCode = "NO_MATCH";
  let bestScore = -1;

  for (const delim of candidates) {
    // Parsear as linhas de amostra com este delimitador
    const parsedMatrix = sampleLines.map(line => splitCsvLine(line, delim));
    
    // Contar colunas por linha
    const columnCounts = parsedMatrix.map(row => row.length);
    const maxCols = Math.max(...columnCounts);
    
    // Ignorar se o delimitador não divide o texto (todas as linhas têm 1 coluna)
    if (maxCols <= 1) {
      continue;
    }

    // Calcular frequência de cada tamanho de coluna para achar a moda
    const frequencies: Record<number, number> = {};
    for (const count of columnCounts) {
      frequencies[count] = (frequencies[count] || 0) + 1;
    }

    let modeCols = 0;
    let modeCount = 0;
    for (const [colsStr, count] of Object.entries(frequencies)) {
      const cols = Number(colsStr);
      if (cols < 2) continue;
      if (count > modeCount || (count === modeCount && cols > modeCols)) {
        modeCount = count;
        modeCols = cols;
      }
    }

    if (modeCols < 2) {
      continue;
    }

    // Consistência: proporção de linhas que têm exatamente a quantidade de colunas da moda
    const consistency = modeCount / sampleLines.length;

    // Verificar se o cabeçalho possui palavras-chave comuns de extrato
    let hasHeaderKeywords = false;
    for (const row of parsedMatrix) {
      const rowText = row.map(c => c.toLowerCase().trim());
      const matches = rowText.filter(cell => 
        COMMON_HEADER_WORDS.some(word => cell.includes(word))
      );
      if (matches.length >= 2) {
        hasHeaderKeywords = true;
        break;
      }
    }

    // Detectar se há fragmentação de decimais brasileiros (ex: se o delimitador for "," e houver colunas que parecem centavos órfãos)
    let decimalFragmentation = 0;
    if (delim === ",") {
      for (const row of parsedMatrix) {
        for (let i = 1; i < row.length; i++) {
          const prev = row[i - 1].trim();
          const curr = row[i].trim();
          // Se o anterior for apenas dígitos (inteiro) e o atual for 2 dígitos (centavos)
          if (/^\d+$/.test(prev) && /^\d{2}$/.test(curr)) {
            decimalFragmentation++;
          }
        }
      }
    }

    // Calcular pontuação de qualidade para este delimitador
    let score = consistency * 100;
    
    // Bônus se contiver palavras-chave de cabeçalho
    if (hasHeaderKeywords) {
      score += 30;
    }

    // Penalidade por fragmentação de decimais
    if (delim === ",") {
      score -= decimalFragmentation * 15;
    }

    // Bônus para ponto e vírgula e tabulações porque são delimitadores muito menos comuns em texto corrido
    if (delim === ";" || delim === "\t") {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
      bestColumnCount = modeCols;
      
      // Classificação de confiança
      if (consistency >= 0.8 && hasHeaderKeywords && decimalFragmentation === 0) {
        bestConfidence = "HIGH";
        bestReasonCode = "CONSISTENT_LAYOUT_WITH_HEADERS";
      } else if (consistency >= 0.5) {
        bestConfidence = "MEDIUM";
        bestReasonCode = "CONSISTENT_LAYOUT";
      } else {
        bestConfidence = "LOW";
        bestReasonCode = "INCONSISTENT_LAYOUT";
      }
    }
  }

  return {
    delimiter: bestDelimiter,
    confidence: bestConfidence,
    expectedColumnCount: bestColumnCount,
    reasonCode: bestDelimiter ? bestReasonCode : "NO_VALID_DELIMITER_FOUND"
  };
}
