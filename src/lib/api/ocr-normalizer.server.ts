/**
 * OCR Text Normalizer and Structural Validator
 * Isolates Tesseract OCR noise handling, formatting corrections, and structural validation
 * to ensure that the core parser only consumes clean, bank-statement-like text.
 */

export class PipelineError extends Error {
  stage: string;
  constructor(message: string, stage: string) {
    super(message);
    this.name = "PipelineError";
    this.stage = stage;
  }
}

// Mapeamento de meses para normalização de datas textuais
const MONTHS_MAP: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
};

/**
 * Normaliza os espaços múltiplos, remove caracteres invisíveis e padroniza quebras de linha.
 */
function normalizeSpaces(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Corrige falhas comuns do OCR em delimitadores de data.
 * Substitui "l", "I" ou "|" cercados de números por "/".
 * Também converte datas textuais (ex: "26 JUN 2026") para formato numérico padrão.
 */
function sanitizeDates(text: string): string {
  let normalized = text;

  // 1. Corrige delimitadores de data corrompidos como 26l06l2026 ou 26I06I2026
  normalized = normalized.replace(/(\b\d{2})[lI|](\d{2})[lI|](\d{4}|\d{2}\b)/g, "$1/$2/$3");
  normalized = normalized.replace(/(\b\d{2})[lI|](\d{2}\b)/g, "$1/$2");

  // 2. Converte datas textuais (ex: 26 JUN 2026 ou 26 de JUNHO de 2026)
  const textualDateRegex = /\b(\d{1,2})\s*(?:de\s*)?([a-zA-Záéíóúâêîôûãõç]{3,9})\s*(?:de\s*)?(\d{4}|\d{2})\b/gi;
  normalized = normalized.replace(textualDateRegex, (match, day, monthName, year) => {
    const monthKey = monthName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 3);
    const monthNum = MONTHS_MAP[monthKey];
    if (monthNum) {
      const paddedDay = day.padStart(2, "0");
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${paddedDay}/${monthNum}/${fullYear}`;
    }
    return match;
  });

  return normalized;
}

/**
 * Corrige confusões de caracteres tipográficos comuns do OCR em blocos que parecem números ou moedas.
 * Exemplo: 'O' no lugar de '0', 'l'/'I' no lugar de '1', 'S' no lugar de '5', 'B' no lugar de '8'.
 */
function sanitizeNumbers(text: string): string {
  return text.split("\n").map((line) => {
    // Substitui typos em palavras que misturam dígitos e letras de typo comuns
    // ex: B1,00, O.O1, 15O0,00. Evita tocar em palavras puramente alfabéticas (ex: "SOL")
    return line.replace(/\b([0-9OolIBsS]+(?:[,\.][0-9OolIBsS]+)?)\b/g, (token) => {
      if (/\d/.test(token) && /[OolIBS]/.test(token)) {
        return token
          .replace(/[Oo]/g, "0")
          .replace(/[lI]/g, "1")
          .replace(/B/g, "8")
          .replace(/[sS]/g, "5");
      }
      return token;
    });
  }).join("\n");
}

/**
 * Recompõe e padroniza os delimitadores decimais e de milhares de moedas brasileiros.
 * Insere a vírgula decimal se faltar em valores inteiros muito grandes identificados como moeda.
 */
function restoreCurrency(text: string): string {
  return text.split("\n").map((line) => {
    let newLine = line;

    // 1. Corrige pontos usados como centavos se o contexto sugerir valor de transação (ex: 497.40 -> 497,40)
    // Apenas se o ponto for seguido de exatamente 2 dígitos no final do token
    newLine = newLine.replace(/(\b\d+)\.(\d{2}\b)/g, "$1,$2");

    // 2. Se houver R$ ou $ seguido de um número sem vírgula (ex: R$ 62281), insere a vírgula antes dos 2 últimos dígitos
    // Exigimos OBRIGATORIAMENTE o cifrão '$' e que o número NÃO seja seguido por vírgula ou ponto decimal e outro dígito
    newLine = newLine.replace(/(R?\$)\s*(\d{3,10})\b(?![\.,]\d)/gi, (match, prefix, digits) => {
      if (!digits.includes(",")) {
        const cents = digits.slice(-2);
        const main = digits.slice(0, -2);
        return `${prefix} ${main},${cents}`;
      }
      return match;
    });

    // 3. Se for um número isolado de 3 a 10 dígitos no final de uma linha que não contenha NENHUMA vírgula,
    // assume que os 2 últimos são centavos (verifica no newLine modificado para evitar duplicar vírgulas)
    if (!newLine.includes(",")) {
      newLine = newLine.replace(/\b(\d{3,10})\s*([-+DcDdCc]?)$/gi, (match, digits, sign) => {
        const cents = digits.slice(-2);
        const main = digits.slice(0, -2);
        return `${main},${cents}${sign}`;
      });
    }

    // 4. Move o sinal de menos do final do valor para o início do bloco numérico (ex: R$ 497,40- -> -R$ 497,40)
    // Isso evita que a inserção de quebra de linha do parser principal corte o sinal de menos para a linha de baixo.
    newLine = newLine.replace(/(R?\$?\s*)(\d+(?:,\d{2})?)-/gi, "-$1$2");

    return newLine;
  }).join("\n");
}

/**
 * Une linhas que começam sem data mas parecem ser a continuação da descrição ou do valor da linha anterior.
 */
function mergeBrokenLines(text: string): string {
  const lines = text.split("\n");
  const merged: string[] = [];
  const datePattern = /\b\d{2}\/\d{2}\/\d{4}\b|\b\d{2}\/\d{2}\/\d{2}\b|\b\d{4}-\d{2}-\d{2}\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (merged.length === 0) {
      merged.push(line);
      continue;
    }

    const lastIdx = merged.length - 1;
    const lastLine = merged[lastIdx];

    const hasDateCur = datePattern.test(line);
    const hasDatePrev = datePattern.test(lastLine);

    if (!hasDateCur && hasDatePrev && !line.includes("SALDO") && !line.includes("Saldo")) {
      merged[lastIdx] = `${lastLine} ${line}`;
    } else {
      merged.push(line);
    }
  }

  return merged.join("\n");
}

/**
 * Filtra e remove linhas informativas e ruídos (cabeçalhos, saldos informativos e metadados)
 * que não contêm transações reais, garantindo que o parser principal não acumule lixo.
 */
function filterMetadataAndNoise(text: string): string {
  const noiseKeywords = [
    "SALDO ANTERIOR", "SALDO ATUAL", "SALDO DO DIA", "SALDO DISPONÍVEL",
    "SALDO CONSOLIDADO", "SALDO BLOQUEADO", "EXTRATO MENSAL", "EXTRATO PERIOD",
    "LANÇAMENTOS DO PERÍODO", "LANÇAMENTOS DO PERIODO", "AGENCIA:", "CONTA:",
    "MEN5AL", "MENSAL", "BRADESC", "EXTRATO"
  ];

  return text
    .split("\n")
    .filter((line) => {
      const upperLine = line.toUpperCase();
      const isNoise = noiseKeywords.some((kw) => upperLine.includes(kw));
      return !isNoise;
    })
    .join("\n");
}

/**
 * Divide linhas contendo descrição e valor na mesma linha física em duas linhas consecutivas.
 * Exemplo: "03/06/2026 PIX ENVIADO R$ 10,00" -> "03/06/2026 PIX ENVIADO \n R$ 10,00"
 * Isso é necessário porque a máquina de estados do parser espera que o valor apareça depois da descrição.
 */
function splitValuesToNewLine(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // Procura por padrões de valores monetários (-R$ XX,XX ou R$ XX,XX ou -XX,XX) no final da linha precedidos por texto
      return line.replace(/(.+?)\s*(-?R?\$?\s*\d+,\d{2}\b)/gi, "$1\n$2");
    })
    .join("\n");
}

/**
 * Pipeline principal de normalização de texto vindo do OCR.
 * Transforma o texto cru e imperfeito do Tesseract em texto limpo simulando um PDF digital pesquisável.
 */
export function normalizeOcrText(rawText: string): string {
  if (!rawText) return "";
  
  let text = rawText;
  text = normalizeSpaces(text);
  text = sanitizeDates(text);
  text = sanitizeNumbers(text);
  text = restoreCurrency(text);
  text = mergeBrokenLines(text);
  text = filterMetadataAndNoise(text);
  text = splitValuesToNewLine(text);
  text = normalizeSpaces(text);
  
  return text;
}

/**
 * OCR Validator
 * Executa análises estruturais e de integridade estatística sobre o texto normalizado.
 * Rejeita explicitamente boletos, comprovantes unitários e imagens sem padrão de extrato tabular.
 * Utiliza o texto bruto (rawText) para classificação do documento e o texto limpo (cleanText) para estrutura.
 */
export function validateOcrText(cleanText: string, rawText: string, averageConfidence?: number): void {
  if (averageConfidence !== undefined && averageConfidence < 70) {
    throw new Error(
      `A imagem do documento possui baixa nitidez (confiança do OCR de ${averageConfidence}%). Por favor, envie uma digitalização mais legível.`
    );
  }

  const normalizedRaw = rawText.toUpperCase();

  // 1. Detecção e Rejeição de Documentos Inadequados (Boletos e Comprovantes Unitários) no TEXTO BRUTO
  const boletoKeywords = [
    "CÓDIGO DE BARRAS", "LINHA DIGITÁVEL", "FICHA DE COMPENSAÇÃO", "SACADO", "CEDENTE",
    "VALOR DO DOCUMENTO", "PAGÁVEL EM", "PAGAVEL PREFERENCIALMENTE", "AGÊNCIA/CÓDIGO BENEFICIÁRIO", "BRADESCO"
  ];
  if (boletoKeywords.some(kw => normalizedRaw.includes(kw))) {
    throw new Error(
      "O arquivo enviado parece ser um Boleto Bancário. O sistema aceita apenas extratos de conta corrente contendo múltiplas transações."
    );
  }

  const comprovanteUnitarioKeywords = [
    "COMPROVANTE DE PIX", "COMPROVANTE DE TRANSFERÊNCIA", "COMPROVANTE DE DEPOSIT",
    "TRANSAÇÃO EFETIVADA", "COMPROVANTE DE PAGAMENTO PIX"
  ];
  if (comprovanteUnitarioKeywords.some(kw => normalizedRaw.includes(kw))) {
    throw new Error(
      "O arquivo enviado é um Comprovante de Transação Única. Por favor, exporte e envie o extrato mensal completo em PDF."
    );
  }

  // 2. Validação de Estrutura Tabular de Extrato Bancário no TEXTO LIMPO
  // Adquirimos as datas e valores ANTES da quebra de linha de valores para manter consistência
  const cleanUpper = cleanText.toUpperCase();
  const dateMatches = cleanText.match(/\b\d{2}\/\d{2}\/\d{4}\b|\b\d{2}\/\d{2}\/\d{2}\b|\b\d{4}-\d{2}-\d{2}\b/g) || [];
  const amountMatches = cleanText.match(/\b\d+,\d{2}\b/g) || [];

  if (dateMatches.length < 2 || amountMatches.length < 2) {
    throw new Error(
      "O documento não contém o volume mínimo de datas ou valores monetários necessários para caracterizar um extrato financeiro."
    );
  }

  // 3. Validação de Blocos de Transação Coerentes (Vizinhança Data + Valor na mesma linha ou linhas adjacentes)
  const lines = cleanText.split("\n");
  const datePattern = /\b\d{2}\/\d{2}\/\d{4}\b|\b\d{2}\/\d{2}\/\d{2}\b|\b\d{4}-\d{2}-\d{2}\b/;
  const amountPattern = /\b\d+,\d{2}\b/;

  let transactionLikeLines = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Se a mesma linha possuir data e valor, ou a linha atual tem data e a seguinte tem valor
    const hasDateCur = datePattern.test(line);
    const hasAmountCur = amountPattern.test(line);
    const hasAmountNext = i + 1 < lines.length && amountPattern.test(lines[i + 1]);

    if ((hasDateCur && hasAmountCur) || (hasDateCur && hasAmountNext)) {
      transactionLikeLines++;
    }
  }

  if (transactionLikeLines === 0) {
    throw new Error(
      "O arquivo não possui estrutura tabular compatível com um extrato (linhas contendo data e valor de transação associados)."
    );
  }
}
