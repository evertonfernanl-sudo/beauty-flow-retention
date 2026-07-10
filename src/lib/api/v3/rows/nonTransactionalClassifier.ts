export type AlignedRow = string[];

export type RowClassificationContext = {
  source: "pdf" | "ocr" | "csv" | "xlsx" | string;
  pageNumber?: number;
  physicalLine?: number;
  isFirstUsefulLineOfPage?: boolean;
  isLastUsefulLineOfPage?: boolean;
  previousClassification?: string | null;
  nextRowPreview?: AlignedRow | null;
  knownHeaders?: string[];
};

export type RowClassificationResult = {
  isTransactionalCandidate: boolean;
  action:
    | "FORWARD_TO_BLOCK_ASSEMBLER"
    | "DISCARD_BEFORE_BLOCKS"
    | "CAPTURE_AS_BALANCE"
    | "CAPTURE_AS_SUMMARY"
    | "CAPTURE_AS_TOTAL"
    | "KEEP_FOR_REVIEW";
  category:
    | "TRANSACTION_CANDIDATE"
    | "INSTITUTIONAL"
    | "METADATA"
    | "REPEATED_HEADER"
    | "FOOTER"
    | "SUMMARY"
    | "BALANCE"
    | "TOTAL"
    | "EMPTY"
    | "AMBIGUOUS";
  reasonCode: string;
  reasons: string[];
  matchedSignals: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  preserveForAudit: boolean;
};

export type RowSignals = {
  hasAnyText: boolean;
  hasValidDate: boolean;
  hasDateLikeText: boolean;
  hasValidMoney: boolean;
  hasDebit: boolean;
  hasCredit: boolean;
  hasBalanceValue: boolean;
  hasDocumentNumber: boolean;
  hasTransactionDescription: boolean;
  hasInstitutionalKeyword: boolean;
  hasMetadataKeyword: boolean;
  hasHeaderKeyword: boolean;
  hasSummaryKeyword: boolean;
  hasBalanceKeyword: boolean;
  hasTotalKeyword: boolean;
  hasFooterKeyword: boolean;
  hasCounterpartyEvidence: boolean;
  nonEmptyCellCount: number;
  numericCellCount: number;
  textualCellCount: number;
};

// Normalização não destrutiva para análise de comparação
function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\/()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyNonTransactionalRow(
  row: AlignedRow,
  context: RowClassificationContext
): RowClassificationResult {
  const reasons: string[] = [];
  const matchedSignals: string[] = [];

  // 1.EMPTY Row check
  const nonEmptyCells = row.map(c => (c || "").trim()).filter(Boolean);
  if (nonEmptyCells.length === 0) {
    return {
      isTransactionalCandidate: false,
      action: "DISCARD_BEFORE_BLOCKS",
      category: "EMPTY",
      reasonCode: "EMPTY_ROW",
      reasons: ["A linha está completamente vazia ou contém apenas espaços."],
      matchedSignals: ["EMPTY"],
      confidence: "HIGH",
      preserveForAudit: false
    };
  }

  // 2. Extração de sinais estruturais
  const fullTextLine = row.join(" ");
  const normalizedFullText = normalizeText(fullTextLine);

  const dateRegex = /\b\d{2}\/\d{2}(\/\d{2,4})?\b/;
  const hasValidDate = row.some(c => dateRegex.test(c));
  const hasDateLikeText = dateRegex.test(fullTextLine);

  // Validação de dinheiro/números (com vírgula decimal)
  const moneyRegex = /\b\d{1,3}(\.\d{3})*(,\d{2})\b/;
  const hasValidMoney = row.some(c => moneyRegex.test(c));

  // Contagem de células por tipo
  let nonEmptyCellCount = 0;
  let numericCellCount = 0;
  let textualCellCount = 0;

  for (const cell of row) {
    const trimmed = cell.trim();
    if (!trimmed) continue;
    nonEmptyCellCount++;
    if (/^-?\d+([.,]\d+)?$/.test(trimmed) || moneyRegex.test(trimmed)) {
      numericCellCount++;
    } else if (/[a-zA-Z]{2,}/.test(trimmed)) {
      textualCellCount++;
    }
  }

  // Palavras-chave
  const hasInstitutional = /\b(agencia|conta|titular|cnpj|cpf|tipo de conta|dados iniciais|dados da conta|dados do cliente|identificacao do cliente|nu pagamentos)\b/i.test(normalizedFullText);
  const hasMetadata = /\b(extrato gerado dia|valores em r\$|valores expressos|periodo|periodo de|pagina|folha|ultimos lancamentos|movimentacao da conta|bradesco celular|internet banking)\b/i.test(normalizedFullText);
  const hasBalance = /\b(saldo anterior|saldo inicial|saldo final|saldo do dia|saldo dia|saldo disponível|saldo em conta)\b/i.test(normalizedFullText);
  const hasSummary = /\b(resumo|resumo do periodo|resumo da movimentacao|resumo de lancamentos|debitos do periodo|creditos do periodo|entradas|saidas)\b/i.test(normalizedFullText);
  const hasTotal = /\b(total|total de debitos|total de creditos|total movimentado)\b/i.test(normalizedFullText);
  const hasFooter = /\b(sac 0800|atendimento 24h|ouvidoria|central de atendimento|autenticacao eletronica|codigo de verificacao)\b/i.test(normalizedFullText);

  // 3. Aplicação de regras por precedência

  // Regra 2: REPEATED_HEADER confirmado
  // Identificação do cabeçalho de tabela repetido (Data, Descrição, Valor, etc.)
  const headerWords = ["data", "descricao", "valor", "historico", "lancamento", "saldo", "debito", "credito", "documento"];
  let matchedHeadersCount = 0;
  for (const c of row) {
    const norm = normalizeText(c);
    const words = norm.split(" ");
    for (const w of words) {
      if (headerWords.includes(w)) {
        matchedHeadersCount++;
      }
    }
  }

  if (matchedHeadersCount >= 3 || (matchedHeadersCount >= 2 && !hasValidDate && !hasValidMoney && nonEmptyCellCount <= 4)) {
    matchedSignals.push("REPEATED_HEADER");
    return {
      isTransactionalCandidate: false,
      action: "DISCARD_BEFORE_BLOCKS",
      category: "REPEATED_HEADER",
      reasonCode: "REPEATED_TABLE_HEADER",
      reasons: ["Cabeçalho tabular repetido confirmado."],
      matchedSignals,
      confidence: "HIGH",
      preserveForAudit: true
    };
  }

  // Regra 3: FOOTER
  if (hasFooter && !hasValidDate && !hasValidMoney) {
    matchedSignals.push("FOOTER");
    return {
      isTransactionalCandidate: false,
      action: "DISCARD_BEFORE_BLOCKS",
      category: "FOOTER",
      reasonCode: "FOOTER_CONTACT",
      reasons: ["Linha identificada como rodapé institucional/contato."],
      matchedSignals,
      confidence: "HIGH",
      preserveForAudit: true
    };
  }

  // Regra 4: INSTITUTIONAL cadastral
  const isAbsoluteInstitutional =
    /^(agencia|conta|titular|cnpj|cpf)\b/i.test(normalizedFullText) ||
    /\b(dados iniciais|dados da conta|dados do cliente|identificacao do cliente)\b/i.test(normalizedFullText) ||
    /^(nome do titular|numero da conta)\b/i.test(normalizedFullText) ||
    /\b(agencia|conta|titular|cnpj|cpf)\b\s*[:\-]/i.test(fullTextLine);

  if (isAbsoluteInstitutional || (hasInstitutional && !hasValidDate && !hasValidMoney && !fullTextLine.includes("Ag") && !fullTextLine.includes("Conta"))) {
    // Proteção: se for um Pix ou Ted contendo "para conta" ou "do banco", não é cadastral
    const isTransactionalOp = /\b(pix|ted|doc|transferencia|pagamento)\b/i.test(normalizedFullText);
    if (!isTransactionalOp) {
      matchedSignals.push("INSTITUTIONAL");
      return {
        isTransactionalCandidate: false,
        action: "DISCARD_BEFORE_BLOCKS",
        category: "INSTITUTIONAL",
        reasonCode: "INSTITUTIONAL_ACCOUNT_DATA",
        reasons: ["Dados cadastrais da conta, titular ou banco emissor."],
        matchedSignals,
        confidence: "HIGH",
        preserveForAudit: true
      };
    }
  }

  // Regra 5: METADATA
  const isAbsoluteMetadata =
    normalizedFullText.includes("extrato gerado dia") ||
    normalizedFullText.includes("valores em r$") ||
    normalizedFullText.includes("valores expressos") ||
    normalizedFullText.includes("periodo de") ||
    normalizedFullText.includes("periodo:") ||
    /pagina \d+ de \d+/i.test(normalizedFullText) ||
    /folha \d+/i.test(normalizedFullText);
  
  const hasMetadataExclusion = hasSummary || hasBalance || hasTotal || normalizedFullText.includes("resumo") || normalizedFullText.includes("saldo") || normalizedFullText.includes("total");
  if ((isAbsoluteMetadata || (hasMetadata && !hasValidDate && !hasValidMoney)) && !hasMetadataExclusion) {
    matchedSignals.push("METADATA");
    return {
      isTransactionalCandidate: false,
      action: "DISCARD_BEFORE_BLOCKS",
      category: "METADATA",
      reasonCode: "METADATA_GENERATION_OR_PERIOD",
      reasons: ["Metadados de geração, período, moeda ou paginação do extrato."],
      matchedSignals,
      confidence: "HIGH",
      preserveForAudit: true
    };
  }

  // Regra 6: BALANCE
  if (hasBalance) {
    // Proteção: evitar descartar transações legítimas contendo a palavra "saldo" (ex: "Ajuste de saldo")
    const isOperationalTransaction = /\b(ajuste|credito|debito|transferencia|pix|compra|tarifa| cashback)\b/i.test(normalizedFullText);
    if (!isOperationalTransaction && !hasValidDate) {
      matchedSignals.push("BALANCE");
      return {
        isTransactionalCandidate: false,
        action: "CAPTURE_AS_BALANCE",
        category: "BALANCE",
        reasonCode: "BALANCE_ROW",
        reasons: ["Linha contendo valor de saldo da conta."],
        matchedSignals,
        confidence: "HIGH",
        preserveForAudit: true
      };
    }
  }

  // Regra 7: SUMMARY
  if (hasSummary && !hasValidDate) {
    matchedSignals.push("SUMMARY");
    return {
      isTransactionalCandidate: false,
      action: "CAPTURE_AS_SUMMARY",
      category: "SUMMARY",
      reasonCode: "SUMMARY_ROW",
      reasons: ["Linha contendo consolidado ou resumo de movimentação."],
      matchedSignals,
      confidence: "HIGH",
      preserveForAudit: true
    };
  }

  // Regra 8: TOTAL
  // Se for total do período, total de débitos, total de créditos, ou múltiplos valores vazios sem descrição operacional
  const isTotalDescription = /\b(total|totais)\b/i.test(normalizedFullText);
  if (hasTotal || (isTotalDescription && !hasValidDate)) {
    matchedSignals.push("TOTAL");
    return {
      isTransactionalCandidate: false,
      action: "CAPTURE_AS_TOTAL",
      category: "TOTAL",
      reasonCode: "TOTAL_ROW",
      reasons: ["Linha contendo totais consolidados de créditos, débitos ou saídas."],
      matchedSignals,
      confidence: "HIGH",
      preserveForAudit: true
    };
  }

  // Regra de Proteção de continuações multilinha (ex: João da Silva, Banco Inter Ag 0001 Conta 12345)
  // Se a linha não tiver data e for composta predominantemente por texto alfabético
  const isSingleHeaderKeyword = nonEmptyCellCount === 1 && headerWords.includes(normalizeText(nonEmptyCells[0]));
  const looksLikeContinuation = !hasValidDate && !hasValidMoney && textualCellCount > 0 && nonEmptyCellCount <= 3 && !isSingleHeaderKeyword;
  if (looksLikeContinuation) {
    // Se a linha anterior foi de transação candidato, protege-a mantendo-a elegível
    matchedSignals.push("CONTINUATION_PROTECTION");
    return {
      isTransactionalCandidate: true,
      action: "FORWARD_TO_BLOCK_ASSEMBLER",
      category: "TRANSACTION_CANDIDATE",
      reasonCode: "TRANSACTION_CONTINUATION",
      reasons: ["Linha protegida como provável continuação de bloco transacional."],
      matchedSignals,
      confidence: "MEDIUM",
      preserveForAudit: false
    };
  }

  // Se houver múltiplos valores preenchidos (débito/crédito) mas nenhuma descrição e nenhuma data
  const hasMultipleValuesWithoutDesc = numericCellCount === nonEmptyCellCount && nonEmptyCellCount >= 2 && !hasValidDate;
  if (hasMultipleValuesWithoutDesc) {
    matchedSignals.push("AMBIGUOUS_MULTIPLE_VALUES");
    return {
      isTransactionalCandidate: true,
      action: "KEEP_FOR_REVIEW",
      category: "AMBIGUOUS",
      reasonCode: "AMBIGUOUS_MULTIPLE_VALUES_NO_DESC",
      reasons: ["Múltiplos valores preenchidos sem data e sem descrição."],
      matchedSignals,
      confidence: "LOW",
      preserveForAudit: true
    };
  }

  // Regra 9: TRANSACTION_CANDIDATE normal
  if (hasValidDate || hasValidMoney || nonEmptyCellCount >= 3) {
    matchedSignals.push("TRANSACTION_SIGNAL");
    return {
      isTransactionalCandidate: true,
      action: "FORWARD_TO_BLOCK_ASSEMBLER",
      category: "TRANSACTION_CANDIDATE",
      reasonCode: "TRANSACTION_CANDIDATE_OK",
      reasons: ["Linha candidata a transação contendo data, valor ou descrição válida."],
      matchedSignals,
      confidence: "HIGH",
      preserveForAudit: false
    };
  }

  // Regra 10: AMBIGUOUS
  matchedSignals.push("AMBIGUOUS_FALLBACK");
  return {
    isTransactionalCandidate: true,
    action: "KEEP_FOR_REVIEW",
    category: "AMBIGUOUS",
    reasonCode: "AMBIGUOUS_ROW",
    reasons: ["Sinais inconclusivos. Linha preservada conservadoramente para revisão."],
    matchedSignals,
    confidence: "LOW",
    preserveForAudit: true
  };
}
