import type { CanonicalRow } from "../pipeline.server";
import { normalizeDescription } from "../enrichment/descriptionNormalizer";
import { detectTransactionPattern, isSystemPattern } from "../enrichment/transactionPatternLibrary";
import { extractClient } from "../enrichment/clientExtractor";
import type { RowQualityDecision, RowConfidenceBreakdown, StructuralGateResult, ConfidenceBand, ConfidenceWeights, StructuralCaps } from "./confidenceTypes";

const DEFAULT_WEIGHTS: ConfidenceWeights = {
  structural: 0.4,
  direction: 0.3,
  semantic: 0.3,
};

const DEFAULT_STRUCTURAL_CAPS: StructuralCaps = {
  MUITO_ALTA: 100,
  ALTA: 89,
  MEDIA: 74,
  BAIXA: 59,
  MUITO_BAIXA: 39,
};

export function evaluateRowQuality(
  c: CanonicalRow,
  directionConfidence: number,
  isPdf: boolean,
  issuerBank?: string | null
): RowQualityDecision {
  const hardFailures: string[] = [];
  const reviewReasons: string[] = [];
  const warnings: string[] = [];
  const reasonCodes: string[] = [];
  const reasonsList: string[] = [];

  // Parse temporal context metadata from raw_extra
  const dateAssignment = c.raw_extra?._dateAssignment ?? "MISSING";
  const dateReasonCode = c.raw_extra?._dateReasonCode ?? "";
  const isAmbiguous = c.raw_extra?._isAmbiguous === "true";
  const ambiguityReasons = (c.raw_extra?._ambiguityReasons ?? "").split(",").filter(Boolean);

  // 1. Validar descrição
  const desc = c.description ? c.description.trim() : "";
  const genericKeywords = ["lançamento", "movimento", "débito", "crédito", "operação", "pagamento", "lancamento", "debito", "credito", "operacao"];
  const isGenericDesc = genericKeywords.includes(desc.toLowerCase());

  const balanceKeywords = /\b(saldo anterior|saldo inicial|saldo final|saldo do dia|saldo dia|saldo disponível|saldo em conta)\b/i;
  const summaryKeywords = /\b(resumo|resumo do periodo|resumo da movimentacao|resumo de lancamentos|debitos do periodo|creditos do periodo|entradas|saidas)\b/i;
  const totalKeywords = /\b(total|total de debitos|total de creditos|total movimentado)\b/i;
  const adminKeywords = /\b(agencia|conta|titular|cnpj|cpf|tipo de conta|dados iniciais|dados da conta|dados do cliente|identificacao do cliente|nu pagamentos|extrato gerado dia|valores em r\$|valores expressos|periodo|periodo de|pagina|folha|ultimos lancamentos|movimentacao da conta|bradesco celular|internet banking|sac 0800|atendimento 24h|ouvidoria|central de atendimento|autenticacao eletronica|codigo de verificacao)\b/i;

  if (balanceKeywords.test(desc)) {
    hardFailures.push("BALANCE_ROW_REACHED_CANONICAL");
    reasonCodes.push("BALANCE_ROW_REACHED_CANONICAL");
    reasonsList.push("Linha de saldo residual atingiu o estágio canonical");
  } else if (summaryKeywords.test(desc)) {
    hardFailures.push("SUMMARY_ROW_REACHED_CANONICAL");
    reasonCodes.push("SUMMARY_ROW_REACHED_CANONICAL");
    reasonsList.push("Linha de resumo residual atingiu o estágio canonical");
  } else if (totalKeywords.test(desc)) {
    hardFailures.push("TOTAL_ROW_REACHED_CANONICAL");
    reasonCodes.push("TOTAL_ROW_REACHED_CANONICAL");
    reasonsList.push("Linha de total residual atingiu o estágio canonical");
  } else if (adminKeywords.test(desc)) {
    hardFailures.push("ADMINISTRATIVE_ROW_REACHED_CANONICAL");
    reasonCodes.push("ADMINISTRATIVE_ROW_REACHED_CANONICAL");
    reasonsList.push("Linha administrativa residual atingiu o estágio canonical");
  }

  if (!desc) {
    hardFailures.push("MISSING_DESCRIPTION");
    reasonCodes.push("MISSING_DESCRIPTION");
    reasonsList.push("Descrição da transação ausente");
  } else if (isGenericDesc && hardFailures.length === 0) {
    warnings.push("DESCRIPTION_GENERIC");
    reasonCodes.push("DESCRIPTION_GENERIC");
    reasonsList.push("Descrição genérica sem detalhes da operação");
  }

  // 2. Validar valor
  const val = c.amount;
  if (val == null) {
    hardFailures.push("MISSING_VALUE");
    reasonCodes.push("MISSING_VALUE");
    reasonsList.push("Valor da transação ausente");
  } else if (val === 0) {
    hardFailures.push("INVALID_VALUE");
    reasonCodes.push("INVALID_VALUE");
    reasonsList.push("Valor da transação igual a zero");
  }

  // 3. Conflito de valores nas colunas débito/crédito
  if (c.debit_amount != null && c.debit_amount !== 0 && c.credit_amount != null && c.credit_amount !== 0) {
    warnings.push("DIRECTION_COLUMN_CONFLICT");
    reasonCodes.push("DIRECTION_COLUMN_CONFLICT");
    reasonsList.push("Ambas as colunas de Débito e Crédito estão preenchidas");
  }

  // 4. Validar data
  if (!c.transaction_date) {
    reviewReasons.push("MISSING_DATE");
    reasonCodes.push("MISSING_DATE");
    reasonsList.push("Data da transação ausente");
  } else if (dateAssignment === "CONFLICT") {
    hardFailures.push("TEMPORAL_CONFLICT");
    reasonCodes.push("TEMPORAL_CONFLICT");
    reasonsList.push("Conflito temporal detectado no bloco");
  } else if (dateAssignment === "INHERITED") {
    if (dateReasonCode === "INHERITED_CROSS_PAGE") {
      reviewReasons.push("CROSS_PAGE_INHERITED_DATE");
      reasonCodes.push("CROSS_PAGE_INHERITED_DATE");
      reasonsList.push("Data herdada através de mudança de página");
    } else {
      warnings.push("INHERITED_DATE");
      reasonCodes.push("INHERITED_DATE");
      reasonsList.push("Data herdada do contexto do bloco");
    }
  }

  // 5. Validar cliente
  const normDesc = normalizeDescription(desc);
  const pattern = detectTransactionPattern(normDesc);
  const isPixOrTed = pattern && ["PIX_RECEIVED", "PIX_SENT", "TED_RECEIVED", "TED_SENT", "DOC_RECEIVED", "DOC_SENT", "TRANSFER_RECEIVED", "TRANSFER_SENT"].includes(pattern);
  const isSystem = pattern && isSystemPattern(pattern);

  const client = c.client_name ? c.client_name.trim() : "";
  if (!client) {
    if (isPixOrTed) {
      reviewReasons.push("MISSING_CLIENT");
      reasonCodes.push("MISSING_CLIENT");
      reasonsList.push("Cliente/Contraparte ausente para transferência/PIX");
    } else if (!isSystem) {
      warnings.push("MISSING_CLIENT");
      reasonCodes.push("MISSING_CLIENT");
      reasonsList.push("Cliente ausente");
    }
  } else {
    // Verificar double bank name: "banco banco"
    if (/\bbanco\s+banco\b/i.test(client)) {
      hardFailures.push("DOUBLE_BANK_NAME_CONFLICT");
      reasonCodes.push("DOUBLE_BANK_NAME_CONFLICT");
      reasonsList.push("Duplicação detectada no nome do banco ('banco banco')");
    } else if (client.toLowerCase() === "banco emissor") {
      warnings.push("GENERIC_ISSUER_BANK");
      reasonCodes.push("GENERIC_ISSUER_BANK");
      reasonsList.push("Utilizando banco emissor genérico");
    }
  }

  // 6. Validar layout unresolved e blocos ambíguos
  const isUnresolvedPage = ambiguityReasons.includes("UNRESOLVED_LAYOUT_LINE");
  if (isUnresolvedPage) {
    reviewReasons.push("UNRESOLVED_PAGE_LAYOUT");
    reasonCodes.push("UNRESOLVED_PAGE_LAYOUT");
    reasonsList.push("Página com layout não resolvido");
  } else if (isAmbiguous) {
    reviewReasons.push("AMBIGUOUS_BLOCK");
    reasonCodes.push("AMBIGUOUS_BLOCK");
    reasonsList.push(`Bloco marcado como ambíguo (${ambiguityReasons.join(", ")})`);
  }

  // 7. Mega-bloco e múltiplas transações
  const hasMegaBlock = ambiguityReasons.includes("POSSIBLE_MEGA_BLOCK");
  const hasMultipleTx = ambiguityReasons.includes("MULTIPLE_TRANSACTIONS") || ambiguityReasons.includes("DOUBLE_VALUE") || ambiguityReasons.includes("MULTIPLE_VALUES");
  if (hasMultipleTx) {
    hardFailures.push("MULTIPLE_TRANSACTIONS_IN_BLOCK");
    reasonCodes.push("MULTIPLE_TRANSACTIONS_IN_BLOCK");
    reasonsList.push("Múltiplas transações detectadas no mesmo bloco");
  } else if (hasMegaBlock) {
    reviewReasons.push("POSSIBLE_MEGA_BLOCK");
    reasonCodes.push("POSSIBLE_MEGA_BLOCK");
    reasonsList.push("Possível mega-bloco contendo múltiplos lançamentos");
  }

  // 8. Rastreabilidade
  if (isPdf) {
    const originLinesRaw = c.raw_extra?._originLines;
    let hasOrigin = false;
    try {
      if (originLinesRaw) {
        const parsedOrigin = JSON.parse(originLinesRaw);
        if (Array.isArray(parsedOrigin) && parsedOrigin.length > 0) {
          hasOrigin = true;
        }
      }
    } catch {
      // ignore
    }
    if (!hasOrigin) {
      reviewReasons.push("MISSING_ORIGIN");
      reasonCodes.push("MISSING_ORIGIN");
      reasonsList.push("Rastreabilidade física de origem ausente no PDF");
    }
  }

  // 9. Cálculo das confianças parciais
  
  // A. Confiança Estrutural
  let structuralConfidence = 100;
  if (hardFailures.length > 0) {
    structuralConfidence = 20; // Muito Baixa
  } else {
    // Penalidades (utiliza else if para UNRESOLVED e AMBIGUOUS_BLOCK para evitar dupla penalização)
    if (reviewReasons.includes("UNRESOLVED_PAGE_LAYOUT")) {
      structuralConfidence -= 40;
    } else if (reviewReasons.includes("AMBIGUOUS_BLOCK")) {
      structuralConfidence -= 40;
    }
    
    if (reviewReasons.includes("CROSS_PAGE_INHERITED_DATE")) {
      structuralConfidence -= 30;
    } else if (warnings.includes("INHERITED_DATE")) {
      structuralConfidence -= 10;
    }
    
    if (reviewReasons.includes("MISSING_DATE")) {
      structuralConfidence -= 40;
    }
    
    if (reviewReasons.includes("MISSING_CLIENT")) {
      structuralConfidence -= 20;
    } else if (warnings.includes("MISSING_CLIENT")) {
      structuralConfidence -= 10;
    }
    
    if (warnings.includes("DESCRIPTION_GENERIC")) {
      structuralConfidence -= 15;
    }
    
    if (hardFailures.includes("MISSING_DESCRIPTION")) {
      structuralConfidence -= 80;
    }
    
    if (warnings.includes("DIRECTION_COLUMN_CONFLICT")) {
      structuralConfidence -= 15;
    }
    
    if (reviewReasons.includes("POSSIBLE_MEGA_BLOCK")) {
      structuralConfidence -= 40; // Penalidade ajustada para 40 para mapear para MEDIA
    }
    
    if (reviewReasons.includes("MISSING_ORIGIN")) {
      structuralConfidence -= 30;
    }
  }
  structuralConfidence = Math.max(0, Math.min(100, structuralConfidence));

  // B. Confiança Semântica
  let semanticConfidence = 100;
  if (!pattern) {
    semanticConfidence = 40; // Baixo match semântico
    reasonCodes.push("SEMANTIC_PATTERN_WEAK");
    reasonsList.push("Padrão semântico fraco ou não identificado");
  } else {
    // Penalidades semânticas
    if (warnings.includes("GENERIC_ISSUER_BANK")) {
      semanticConfidence -= 20;
    }
    if (isPixOrTed && !client) {
      semanticConfidence -= 30;
    }
  }
  semanticConfidence = Math.max(0, Math.min(100, semanticConfidence));

  // 10. Bandas das confianças parciais
  const getBand = (score: number): ConfidenceBand => {
    if (score >= 90) return "MUITO_ALTA";
    if (score >= 75) return "ALTA";
    if (score >= 60) return "MEDIA";
    if (score >= 40) return "BAIXA";
    return "MUITO_BAIXA";
  };

  const structuralBand = getBand(structuralConfidence);
  const directionBand = getBand(directionConfidence);
  const semanticBand = getBand(semanticConfidence);

  // 11. Cálculo do overall_confidence usando pesos e teto estrutural
  const weights = DEFAULT_WEIGHTS;
  const caps = DEFAULT_STRUCTURAL_CAPS;

  let overallConfidence = (structuralConfidence * weights.structural) + 
                          (directionConfidence * weights.direction) + 
                          (semanticConfidence * weights.semantic);
  
  // Aplica teto estrutural
  const cap = caps[structuralBand];
  if (overallConfidence > cap) {
    overallConfidence = cap;
    reasonCodes.push("CAPPED_BY_STRUCTURE");
    reasonsList.push(`Confiança global limitada pelo teto estrutural (${structuralBand})`);
  }

  // Aplica teto de banco emissor genérico: limita a ALTA (máximo 89)
  if (warnings.includes("GENERIC_ISSUER_BANK") && overallConfidence >= 90) {
    overallConfidence = 89;
    reasonCodes.push("CAPPED_BY_GENERIC_BANK");
    reasonsList.push("Confiança global limitada devido ao uso de banco emissor genérico");
  }

  // Aplica teto de cliente ausente em transferência/PIX: limita a ALTA (máximo 89)
  if (reviewReasons.includes("MISSING_CLIENT") && overallConfidence >= 90) {
    overallConfidence = 89;
    reasonCodes.push("CAPPED_BY_MISSING_CLIENT");
    reasonsList.push("Confiança global limitada devido a cliente ausente em transferência/PIX");
  }

  const overallBand = getBand(overallConfidence);

  // 12. Decisão final de status
  let finalStatus: "LINE_APPROVED" | "LINE_REVIEW" | "LINE_FAILED" = "LINE_APPROVED";
  if (hardFailures.length > 0) {
    finalStatus = "LINE_FAILED";
  } else if (reviewReasons.length > 0 || overallBand === "MUITO_BAIXA") {
    finalStatus = "LINE_REVIEW";
  }

  const gate: StructuralGateResult = {
    passed: hardFailures.length === 0,
    hardFailures,
    reviewReasons,
    warnings,
  };

  const confidence: RowConfidenceBreakdown = {
    directionConfidence,
    structuralConfidence,
    semanticConfidence,
    overallConfidence,
    directionBand,
    structuralBand,
    semanticBand,
    overallBand,
  };

  return {
    gate,
    confidence,
    finalStatus,
    reasonCodes,
    reasons: reasonsList,
  };
}
