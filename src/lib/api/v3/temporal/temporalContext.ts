import { AssembledBlock, TemporalAssignmentKind, TemporalContext, TemporalResolvedBlock } from "./temporalTypes";

// NTIEB Cap. 7, 13, 14, 16.4 — Resolvedor de contexto temporal e herança de datas.

export type ApplyTemporalContextInput = {
  blocks: AssembledBlock[];
  dateIdx: number;
  valueIdxs: number[];
  descIdx: number;
  parseDate: (s: string) => string | null;
  isCoordinateBased: boolean;
  filteredRows?: any[];
  statementPeriod?: { start: string; end: string };
  meta?: any;
};

function isValidDateString(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const date = new Date(y, month, d);
  return date.getFullYear() === y && date.getMonth() === month && date.getDate() === d;
}

export function applyTemporalContextToBlocks(input: ApplyTemporalContextInput): TemporalResolvedBlock[] {
  const { blocks, dateIdx, valueIdxs, descIdx, parseDate, isCoordinateBased, filteredRows, statementPeriod, meta } = input;
  const resolved: TemporalResolvedBlock[] = [];

  // Configurações
  const rejectFutureDatesBeyondDays = 30;

  // Estado do contexto temporal
  const context: TemporalContext = {
    lastValidTransactionDate: null,
    sourcePageNumber: null,
    sourcePhysicalLine: null,
    sourceBlockId: null,
    sourceKind: null,
    valid: false,
    currentPageNumber: null,
    chronologicalDirection: "UNKNOWN",
    explicitDatesDetected: []
  };

  // Estatísticas de Observabilidade
  let blocks_received_phase5 = blocks.length;
  let blocks_with_explicit_date = 0;
  let blocks_with_inherited_date = 0;
  let blocks_without_date = 0;
  let blocks_with_temporal_conflict = 0;
  let date_group_markers_detected = 0;
  let temporal_context_updates = 0;
  let temporal_context_invalidations = 0;
  let cross_page_inheritances = 0;
  let inheritance_rejections = 0;
  let invalid_explicit_dates = 0;
  let temporal_outliers = 0;
  let possible_stale_temporal_contexts = 0;

  // Intercalar blocos e linhas filtradas (saldo, resumo, total) na ordem física correta
  type ChronologicalItem =
    | { type: "BLOCK"; block: AssembledBlock; index: number; seq: number }
    | { type: "FILTERED_ROW"; row: any; seq: number };

  const items: ChronologicalItem[] = [];

  blocks.forEach((block, idx) => {
    const line = block.originLines[0];
    const seq = (line?.pageNumber ?? 1) * 100000 + (line?.physicalLine ?? 1);
    items.push({ type: "BLOCK", block, index: idx, seq });
  });

  filteredRows?.forEach((frow) => {
    const seq = (frow.pageNumber ?? 1) * 100000 + (frow.physicalLine ?? 1);
    items.push({ type: "FILTERED_ROW", row: frow, seq });
  });

  // Ordenação física ascendente
  items.sort((a, b) => a.seq - b.seq);

  // Invalidação do contexto
  function invalidateContext(reason: string) {
    if (context.valid) {
      context.valid = false;
      context.invalidationReason = reason;
      temporal_context_invalidations++;
    }
  }

  // Rastreamento por bloco
  const blockDecisions: any[] = [];
  let consecutiveInheritedCount = 0;

  for (const item of items) {
    if (item.type === "FILTERED_ROW") {
      const category = item.row.category;
      const text = String(item.row.originalText ?? "").toLowerCase();

      // Critérios de invalidação por saldos, resumos e totais
      if (category === "BALANCE") {
        invalidateContext("FINAL_BALANCE");
      } else if (category === "SUMMARY") {
        invalidateContext("SUMMARY_BOUNDARY");
      } else if (category === "TOTAL") {
        invalidateContext("SUMMARY_BOUNDARY");
      } else if (category === "METADATA" && /\b(periodo|de \d{2}\/\d{2} a \d{2}\/\d{2})\b/i.test(text)) {
        invalidateContext("PERIOD_CHANGE");
      } else if (category === "INSTITUTIONAL" && /\b(agencia|conta|cnpj|titular)\b/i.test(text)) {
        invalidateContext("SECTION_CHANGE");
      }
      continue;
    }

    // Processamento do Bloco
    const block = item.block;
    const blockId = `block_${item.index}`;
    const row = [...block.row];
    const pageNum = block.pageStart;
    context.currentPageNumber = pageNum;

    const dateCell = dateIdx >= 0 ? String(row[dateIdx] ?? "").trim() : "";
    let parsed = parseDate(dateCell);
    const descCell = descIdx >= 0 ? String(row[descIdx] ?? "").trim() : "";
    const hasValue = valueIdxs.some((idx) => String(row[idx] ?? "").trim().length > 0);

    // Coleta datas presentes na descrição (utilizadas em fallback e conflito).
    let descDatesUnique: string[] = [];
    if (descIdx >= 0 && descCell) {
      const datesInDesc = descCell.match(/\b\d{2}[\/\-.]\d{2}([\/\-.]\d{2,4})?\b/g);
      if (datesInDesc && datesInDesc.length > 0) {
        const parsedDescDates = datesInDesc.map(parseDate).filter(Boolean) as string[];
        descDatesUnique = Array.from(new Set(parsedDescDates));
      }
    }

    // Fallback: se a coluna de data está vazia e a descrição contém exatamente UMA
    // data válida, promove-a a data explícita da linha (comum em extratos onde
    // "07/07 pix ..." fica todo na coluna de descrição).
    let promotedFromDescription = false;
    if (!parsed && hasValue && descDatesUnique.length === 1) {
      parsed = descDatesUnique[0];
      promotedFromDescription = true;
    }

    // Validação de múltiplas datas explícitas no mesmo bloco (ex: na descrição)
    // Regra: só é conflito se a coluna de data estiver preenchida (parsed != null) e divergir
    // da data presente na descrição, OU se houver múltiplas datas divergentes dentro da própria descrição.
    let multipleDates = false;
    if (descDatesUnique.length > 0 && !promotedFromDescription) {
      const originalParsed = parseDate(dateCell);
      if (originalParsed) {
        // Coluna de data preenchida: conflito se qualquer data da descrição divergir
        if (descDatesUnique.some((d) => d !== originalParsed)) {
          multipleDates = true;
        }
      } else {
        // Coluna vazia: só é conflito se houver múltiplas datas divergentes na descrição
        if (descDatesUnique.length > 1) {
          multipleDates = true;
        }
      }
    }

    // Detecção de marcadores de data agrupadora
    let isDateGroupMarker = false;
    if (parsed && !hasValue && (!descCell || descCell.length <= 10) && !promotedFromDescription) {
      // Se não tem valor, descrição vazia ou muito curta (apenas o próprio dia/mês), e tem data
      isDateGroupMarker = true;
    }


    let assignment: TemporalAssignmentKind = "MISSING";
    let resolvedDate: string | null = null;
    let reasonCode = "NO_TEMPORAL_CONTEXT";
    const reasons: string[] = [];

    // Tratamento de conflito de datas explícitas
    if (multipleDates) {
      assignment = "CONFLICT";
      reasonCode = "MULTIPLE_EXPLICIT_DATES";
      blocks_with_temporal_conflict++;
      invalidateContext("TEMPORAL_CONFLICT");
    } else if (parsed && block.hasExplicitDate) {
      // Bloco possui data explícita
      if (!isValidDateString(parsed)) {
        assignment = "CONFLICT";
        reasonCode = "INVALID_EXPLICIT_DATE";
        blocks_with_temporal_conflict++;
        invalid_explicit_dates++;
        invalidateContext("INVALID_EXPLICIT_DATE");
      } else {
        // Validação contra período do extrato
        let outsidePeriod = false;
        if (statementPeriod) {
          if (parsed < statementPeriod.start || parsed > statementPeriod.end) {
            outsidePeriod = true;
          }
        }

        // Validação de data no futuro distante
        const now = new Date();
        const futureLimit = new Date(now.getTime() + rejectFutureDatesBeyondDays * 24 * 3600_000);
        const parsedDateObj = new Date(parsed);
        const isFuture = parsedDateObj.getTime() > futureLimit.getTime();

        if (outsidePeriod) {
          assignment = "CONFLICT";
          reasonCode = "OUTSIDE_STATEMENT_PERIOD";
          blocks_with_temporal_conflict++;
          invalidateContext("OUTSIDE_STATEMENT_PERIOD");
        } else if (isFuture) {
          assignment = "CONFLICT";
          reasonCode = "TEMPORAL_OUTLIER";
          temporal_outliers++;
          invalidateContext("TEMPORAL_OUTLIER");
        } else {
          // Data explícita válida
          assignment = isDateGroupMarker ? "DATE_GROUP_MARKER" : "EXPLICIT";
          resolvedDate = parsed;
          reasonCode = isDateGroupMarker ? "INHERITED_GROUP_MARKER" : "EXPLICIT_VALID_DATE";

          // Atualiza direção cronológica
          if (context.lastValidTransactionDate) {
            if (parsed > context.lastValidTransactionDate) {
              context.chronologicalDirection = "ASCENDING";
            } else if (parsed < context.lastValidTransactionDate) {
              context.chronologicalDirection = "DESCENDING";
            }
          }
          context.explicitDatesDetected.push(parsed);

          // Atualiza contexto temporal
          context.lastValidTransactionDate = parsed;
          context.sourceBlockId = blockId;
          context.sourcePageNumber = pageNum;
          context.sourcePhysicalLine = block.originLines[0]?.physicalLine ?? 1;
          context.sourceKind = isDateGroupMarker ? "DATE_GROUP_MARKER" : "EXPLICIT_TRANSACTION";
          context.valid = true;
          temporal_context_updates++;

          if (isDateGroupMarker) {
            date_group_markers_detected++;
          } else {
            blocks_with_explicit_date++;
          }
          consecutiveInheritedCount = 0;
        }
      }
    } else {
      // Bloco não possui data explícita -> Candidato à herança
      let eligible = true;

      if (!context.valid || !context.lastValidTransactionDate) {
        eligible = false;
        reasonCode = "NO_TEMPORAL_CONTEXT";
      } else if (block.isAmbiguous) {
        eligible = false;
        reasonCode = "AMBIGUOUS_BLOCK";
        inheritance_rejections++;
      } else if (!hasValue) {
        // Bloco sem valor não herda data (não é transação legítima)
        eligible = false;
        reasonCode = "AMBIGUOUS_BLOCK";
        inheritance_rejections++;
      }

      // Tratamento de mudança de página
      let crossPage = false;
      if (eligible && context.currentPageNumber !== context.sourcePageNumber) {
        // Mudança de página!
        crossPage = true;
        // Permite se o contexto for de transação explícita válida e não foi invalidado
        reasonCode = "INHERITED_CROSS_PAGE";
        cross_page_inheritances++;
      }

      if (eligible) {
        assignment = "INHERITED";
        resolvedDate = context.lastValidTransactionDate;
        if (!crossPage) {
          reasonCode = "INHERITED_SAME_GROUP";
        }
        blocks_with_inherited_date++;
        consecutiveInheritedCount++;

        // Alerta de quantidade excessiva de heranças consecutivas
        if (consecutiveInheritedCount > 10) {
          possible_stale_temporal_contexts++;
          reasons.push("POSSIBLE_STALE_CONTEXT");
        }
      } else {
        assignment = "MISSING";
        resolvedDate = null;
        blocks_without_date++;
      }
    }

    // Registra a decisão por bloco para observabilidade
    blockDecisions.push({
      blockId,
      pageStart: block.pageStart,
      originLines: block.originLines,
      assignment,
      date: resolvedDate,
      reasonCode,
      sourceBlockId: context.sourceBlockId,
      sourcePageNumber: context.sourcePageNumber,
      sourcePhysicalLine: context.sourcePhysicalLine,
      inheritedAcrossPage: context.currentPageNumber !== context.sourcePageNumber && assignment === "INHERITED",
      reasons
    });

    // Atualiza a linha de dados do bloco com a data resolvida
    if (dateIdx >= 0) {
      row[dateIdx] = resolvedDate || "";
    }

    resolved.push({
      row,
      dateRaw: dateCell,
      dateNormalized: resolvedDate,
      dateDetected: assignment === "EXPLICIT" || assignment === "DATE_GROUP_MARKER",
      dateInherited: assignment === "INHERITED",
      dateAssignment: assignment,
      dateSourcePage: context.sourcePageNumber,
      dateSourcePhysicalLine: context.sourcePhysicalLine,
      dateSourceBlockId: context.sourceBlockId,
      dateReasonCode: reasonCode,
      blockId,
      pageStart: block.pageStart,
      pageEnd: block.pageEnd,
      originLines: block.originLines,
      isAmbiguous: block.isAmbiguous,
      ambiguityReasons: block.ambiguityReasons,
      hasExplicitDate: block.hasExplicitDate,
      hasExplicitValue: block.hasExplicitValue,
    });
  }

  // Fim do arquivo invalida contexto
  invalidateContext("END_OF_FILE");

  // Salva no objeto meta
  if (meta) {
    meta.blocks_received_phase5 = blocks_received_phase5;
    meta.blocks_with_explicit_date = blocks_with_explicit_date;
    meta.blocks_with_inherited_date = blocks_with_inherited_date;
    meta.blocks_without_date = blocks_without_date;
    meta.blocks_with_temporal_conflict = blocks_with_temporal_conflict;
    meta.date_group_markers_detected = date_group_markers_detected;
    meta.temporal_context_updates = temporal_context_updates;
    meta.temporal_context_invalidations = temporal_context_invalidations;
    meta.cross_page_inheritances = cross_page_inheritances;
    meta.inheritance_rejections = inheritance_rejections;
    meta.invalid_explicit_dates = invalid_explicit_dates;
    meta.temporal_outliers = temporal_outliers;
    meta.possible_stale_temporal_contexts = possible_stale_temporal_contexts;
    meta.temporal_decisions = blockDecisions;
  }

  return resolved;
}
