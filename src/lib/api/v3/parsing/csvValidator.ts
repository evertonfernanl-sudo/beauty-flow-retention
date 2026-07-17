import Papa from "papaparse";

export type CsvValidationError = {
  line: number;
  column?: string;
  error: string;
};

export type CsvValidationResult = {
  valid: boolean;
  errors: CsvValidationError[];
};

const CANONICAL_HEADERS = [
  "date",
  "description",
  "amount",
  "debit",
  "credit",
  "balance",
  "doc",
  "client_name",
  "cpf_cnpj",
  "phone",
  "movement_type",
  "page",
  "origin_lines"
];

/**
 * Validates a canonical CSV string according to structural and semantic rules.
 */
export function validateCanonicalCsv(csvText: string): CsvValidationResult {
  const errors: CsvValidationError[] = [];
  
  if (!csvText || !csvText.trim()) {
    return {
      valid: false,
      errors: [{ line: 0, error: "O CSV canônico está vazio ou nulo." }]
    };
  }

  const parsed = Papa.parse<string[]>(csvText, {
    delimiter: ";",
    skipEmptyLines: true,
    escapeChar: '"',
    quoteChar: '"'
  });

  if (parsed.errors && parsed.errors.length > 0) {
    for (const err of parsed.errors) {
      errors.push({
        line: (err.row ?? 0) + 1,
        error: `Erro de sintaxe no PapaParse: ${err.message}`
      });
    }
    return { valid: false, errors };
  }

  const matrix = parsed.data || [];
  if (matrix.length === 0) {
    return {
      valid: false,
      errors: [{ line: 0, error: "Nenhuma linha de dados encontrada no CSV." }]
    };
  }

  // 1. Validar cabeçalho
  const headers = matrix[0].map(h => String(h || "").trim());
  if (headers.length !== CANONICAL_HEADERS.length) {
    return {
      valid: false,
      errors: [{
        line: 1,
        error: `O cabeçalho do CSV possui ${headers.length} colunas, mas o modelo canônico exige exatamente ${CANONICAL_HEADERS.length}.`
      }]
    };
  }

  for (let i = 0; i < CANONICAL_HEADERS.length; i++) {
    if (headers[i] !== CANONICAL_HEADERS[i]) {
      errors.push({
        line: 1,
        column: CANONICAL_HEADERS[i],
        error: `Coluna incorreta na posição ${i + 1}. Esperado: "${CANONICAL_HEADERS[i]}", Obtido: "${headers[i]}".`
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 2. Validar linhas de corpo
  for (let rowIdx = 1; rowIdx < matrix.length; rowIdx++) {
    const row = matrix[rowIdx];
    const lineNum = rowIdx + 1;

    // Verificar quantidade de colunas
    if (row.length !== CANONICAL_HEADERS.length) {
      errors.push({
        line: lineNum,
        error: `Linha com ${row.length} colunas. O modelo canônico exige exatamente ${CANONICAL_HEADERS.length}.`
      });
      continue;
    }

    const dateVal = String(row[0] || "").trim();
    const descVal = String(row[1] || "").trim();
    const amountVal = String(row[2] || "").trim();
    const debitVal = String(row[3] || "").trim();
    const creditVal = String(row[4] || "").trim();
    const balanceVal = String(row[5] || "").trim();
    const pageVal = String(row[11] || "").trim();
    const originLinesVal = String(row[12] || "").trim();

    // Validar formato de data (AAAA-MM-DD ou vazio)
    if (dateVal) {
      const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(dateVal);
      if (!isDateValid) {
        errors.push({
          line: lineNum,
          column: "date",
          error: `Data com formato inválido: "${dateVal}". O formato deve ser estritamente "AAAA-MM-DD".`
        });
      }
    }

    // Validar formato numérico monetário (deve ser em formato brasileiro com vírgula ou vazio)
    const validateNumberFormat = (val: string, colName: string) => {
      if (!val) return;
      // Aceita números como -1250,55, +170,00 ou 1.250,00. Aceita também R$, parênteses, espaços e marcadores de D/C.
      const cleaned = val
        .replace(/R\$/gi, "")
        .replace(/\s+/g, "")
        .replace(/[\(\)]/g, "")
        .replace(/^[+-]/, "")
        .replace(/[+-]$/, "")
        .replace(/[DC]$/i, "");
      const isNumeric = /^\d+(?:\.\d{3})*(?:\,\d{2})?$/.test(cleaned) || /^\d+(?:\,\d{2})?$/.test(cleaned);
      if (!isNumeric) {
        errors.push({
          line: lineNum,
          column: colName,
          error: `Valor monetário "${val}" inválido. Deve usar pontuação decimal brasileira (vírgula).`
        });
      }
    };

    validateNumberFormat(amountVal, "amount");
    validateNumberFormat(debitVal, "debit");
    validateNumberFormat(creditVal, "credit");
    validateNumberFormat(balanceVal, "balance");

    // Validar página e origin_lines
    if (!pageVal || isNaN(Number(pageVal))) {
      errors.push({
        line: lineNum,
        column: "page",
        error: `Metadado da página inválido: "${pageVal}".`
      });
    }

    if (originLinesVal) {
      try {
        const parsedOrigin = JSON.parse(originLinesVal);
        if (!Array.isArray(parsedOrigin)) {
          throw new Error("Não é um array JSON");
        }
        for (const item of parsedOrigin) {
          if (typeof item !== "string" || !/^\d+:\d+$/.test(item)) {
            throw new Error(`Item inválido no origin_lines: "${item}"`);
          }
        }
      } catch (err: any) {
        errors.push({
          line: lineNum,
          column: "origin_lines",
          error: `Erro ao validar origin_lines "${originLinesVal}": ${err.message}`
        });
      }
    } else {
      errors.push({
        line: lineNum,
        column: "origin_lines",
        error: "Metadado origin_lines obrigatório ausente."
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
