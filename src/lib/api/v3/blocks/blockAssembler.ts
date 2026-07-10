// NTIEB Cap. 7, 13, 14, 16.4 — Reconstrução de blocos multi-linha e máquina de estados estruturada.

export type BlockLineKind =
  | "TRANSACTION_START"
  | "TRANSACTION_CONTINUATION"
  | "TRANSACTION_BOUNDARY"
  | "AMBIGUOUS_BLOCK_LINE";

export type BlockLineMetadata = {
  pageNumber?: number;
  physicalLine?: number;
  pageLayoutResolved?: boolean;
};

export type BlockAssemblerInput = {
  bodyMatrix: string[][];
  dateIdx: number;              // índice da coluna de data no header (ou -1)
  valueIdxs: number[];          // índices de colunas de valor/débito/crédito
  descIdx: number;              // índice da coluna de descrição (ou -1)
  parseDate: (s: string) => string | null;
  lineMetadata?: BlockLineMetadata[];
};

export type BlockAssemblerOutput = {
  merged: string[][];
  blocksClosed: number;
  linesAppended: number;        
  datesInherited: number;       // Mantido em 0 nesta fase por conta da desativação
};

type ActiveBlock = {
  firstRow: string[];
  pageStart: number;
  pageEnd: number;
  originLines: Array<{ pageNumber: number; physicalLine: number }>;
  descriptionLines: string[];
  hasExplicitDate: boolean;
  hasExplicitValue: boolean;
  isAmbiguous: boolean;
  ambiguityReasons: string[];
};

export function assembleBlocks(input: BlockAssemblerInput): BlockAssemblerOutput {
  const { bodyMatrix, dateIdx, valueIdxs, descIdx, parseDate, lineMetadata } = input;
  const merged: string[][] = [];
  
  let blocksClosed = 0;
  let linesAppended = 0;
  let datesInherited = 0; // Sempre 0 nesta fase

  let activeBlock: ActiveBlock | null = null;

  function emitActiveBlock() {
    if (!activeBlock) return;
    
    const row = [...activeBlock.firstRow];
    
    // Deduplicação literal e consecutiva da descrição
    const descriptionParts: string[] = [];
    for (const line of activeBlock.descriptionLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (descriptionParts.length > 0 && descriptionParts[descriptionParts.length - 1].toLowerCase() === trimmed.toLowerCase()) {
        continue;
      }
      descriptionParts.push(trimmed);
    }

    if (descIdx >= 0) {
      row[descIdx] = descriptionParts.join(" ").replace(/\s+/g, " ").trim();
    }

    merged.push(row);
    if (activeBlock.hasExplicitDate && activeBlock.hasExplicitValue) {
      blocksClosed++;
    }
    activeBlock = null;
  }

  for (let idx = 0; idx < bodyMatrix.length; idx++) {
    const row = bodyMatrix[idx];
    const meta = lineMetadata && lineMetadata[idx] ? lineMetadata[idx] : undefined;
    const prevMeta = idx > 0 && lineMetadata && lineMetadata[idx - 1] ? lineMetadata[idx - 1] : undefined;

    const dateCell = dateIdx >= 0 ? String(row[dateIdx] ?? "").trim() : "";
    const hasDate = parseDate(dateCell) != null;
    const hasValue = valueIdxs.some((i) => String(row[i] ?? "").trim().length > 0);
    const descCell = descIdx >= 0 ? String(row[descIdx] ?? "").trim() : "";

    // Classificação da linha
    let kind: BlockLineKind = "TRANSACTION_START";
    let reasonCode = "DEFAULT_START";

    if (meta?.pageLayoutResolved === false) {
      kind = "AMBIGUOUS_BLOCK_LINE";
      reasonCode = "UNRESOLVED_LAYOUT_LINE";
    } else if (hasDate && hasValue) {
      kind = "TRANSACTION_START";
      reasonCode = "DATE_AND_VALUE";
    } else if (hasDate && !hasValue) {
      // Data isolada não deve abrir bloco se não houver texto transacional
      if (!descCell || descCell.length <= 4) {
        kind = "AMBIGUOUS_BLOCK_LINE";
        reasonCode = "DATE_ONLY_SHORT_DESC";
      } else {
        kind = "TRANSACTION_START";
        reasonCode = "DATE_WITH_DESC";
      }
    } else if (!hasDate && hasValue) {
      // Valor sem data
      if (activeBlock && !activeBlock.hasExplicitValue) {
        // Se o bloco aberto não possui valor, esta linha com valor completa o bloco
        kind = "TRANSACTION_CONTINUATION";
        reasonCode = "VALUE_COMPLETES_BLOCK";
      } else if (activeBlock && activeBlock.hasExplicitValue) {
        // Bloco aberto já tem valor -> valor na nova linha indica nova transação
        kind = "TRANSACTION_START";
        reasonCode = "NEW_VALUE_SINAL";
      } else {
        // Sem bloco aberto
        kind = "AMBIGUOUS_BLOCK_LINE";
        reasonCode = "VALUE_WITHOUT_DATE_OR_BLOCK";
      }
    } else {
      // Sem data e sem valor
      if (activeBlock) {
        // Proteção contra linhas administrativas residuais
        const fullRowText = row.join(" ");
        const isHeaderResidual = /\b(data|historico|valor|debito|credito|documento|saldo)\b/i.test(fullRowText) && fullRowText.split("|").length >= 2;
        const isNoiseResidual = /\b(extrato gerado dia|valores em r\$|periodo|pagina \d+ de \d+|folha \d+|sac 0800|ouvidoria|titular|cnpj|cpf|dados iniciais|dados da conta|dados do cliente|identificacao do cliente)\b/i.test(fullRowText);
        if (isHeaderResidual || isNoiseResidual) {
          kind = "TRANSACTION_BOUNDARY";
          reasonCode = isHeaderResidual ? "HEADER_RESIDUAL" : "NOISE_RESIDUAL";
        } else {
          kind = "TRANSACTION_CONTINUATION";
          reasonCode = "TEXT_CONTINUATION";
        }
      } else {
        kind = "AMBIGUOUS_BLOCK_LINE";
        reasonCode = "ORPHAN_TEXT";
      }
    }



    // Tratamento de mudança de página
    let isCrossPageContinuation = false;
    if (activeBlock && meta && prevMeta && meta.pageNumber !== prevMeta.pageNumber) {
      // Houve mudança de página!
      // Só continua se for continuação legítima: sem data, sem valor, descrição incompleta
      if (kind === "TRANSACTION_CONTINUATION" && !hasDate && !hasValue) {
        const lastDesc = activeBlock.descriptionLines[activeBlock.descriptionLines.length - 1] || "";
        const isLastWordIncomplete = /\b(para|do|da|de|com|em|banco|ag)\s*$/i.test(lastDesc) || lastDesc.length > 50;
        if (isLastWordIncomplete) {
          isCrossPageContinuation = true;
        }
      }
      
      if (!isCrossPageContinuation) {
        emitActiveBlock();
      }
    }

    // Máquina de Estados
    if (!activeBlock) {
      // Estado: NO_OPEN_BLOCK
      if (kind === "TRANSACTION_START") {
        activeBlock = {
          firstRow: row,
          pageStart: meta?.pageNumber ?? 1,
          pageEnd: meta?.pageNumber ?? 1,
          originLines: [{ pageNumber: meta?.pageNumber ?? 1, physicalLine: meta?.physicalLine ?? 1 }],
          descriptionLines: descCell ? [descCell] : [],
          hasExplicitDate: hasDate,
          hasExplicitValue: hasValue,
          isAmbiguous: false,
          ambiguityReasons: []
        };
      } else if (kind === "AMBIGUOUS_BLOCK_LINE") {
        activeBlock = {
          firstRow: row,
          pageStart: meta?.pageNumber ?? 1,
          pageEnd: meta?.pageNumber ?? 1,
          originLines: [{ pageNumber: meta?.pageNumber ?? 1, physicalLine: meta?.physicalLine ?? 1 }],
          descriptionLines: descCell ? [descCell] : [],
          hasExplicitDate: hasDate,
          hasExplicitValue: hasValue,
          isAmbiguous: true,
          ambiguityReasons: [reasonCode]
        };
      } else {
        // BOUNDARY ou continuação órfã sem bloco anterior
        merged.push(row);
      }
    } else {
      // Estado: OPEN_BLOCK ou OPEN_AMBIGUOUS_BLOCK
      if (kind === "TRANSACTION_START") {
        emitActiveBlock();
        activeBlock = {
          firstRow: row,
          pageStart: meta?.pageNumber ?? 1,
          pageEnd: meta?.pageNumber ?? 1,
          originLines: [{ pageNumber: meta?.pageNumber ?? 1, physicalLine: meta?.physicalLine ?? 1 }],
          descriptionLines: descCell ? [descCell] : [],
          hasExplicitDate: hasDate,
          hasExplicitValue: hasValue,
          isAmbiguous: false,
          ambiguityReasons: []
        };
      } else if (kind === "TRANSACTION_CONTINUATION") {
        // Anexa ao bloco
        if (descIdx >= 0 && descCell) {
          activeBlock.descriptionLines.push(descCell);
        }
        activeBlock.pageEnd = meta?.pageNumber ?? activeBlock.pageEnd;
        activeBlock.originLines.push({ pageNumber: meta?.pageNumber ?? 1, physicalLine: meta?.physicalLine ?? 1 });

        // Copia colunas de valores/documento que possam ter vindo na continuação se estivessem vazios
        for (const i of valueIdxs) {
          const val = String(row[i] ?? "").trim();
          if (val && !activeBlock.firstRow[i]) {
            activeBlock.firstRow[i] = val;
            activeBlock.hasExplicitValue = true;
          }
        }
        
        // Copia outras colunas úteis preenchidas
        row.forEach((cell, i) => {
          if (i !== dateIdx && i !== descIdx && !valueIdxs.includes(i)) {
            const val = String(cell ?? "").trim();
            if (val && !activeBlock!.firstRow[i]) {
              activeBlock!.firstRow[i] = val;
            }
          }
        });

        linesAppended++;
      } else if (kind === "TRANSACTION_BOUNDARY") {
        emitActiveBlock();
        merged.push(row);
      } else {
        // AMBIGUOUS_BLOCK_LINE
        emitActiveBlock();
        activeBlock = {
          firstRow: row,
          pageStart: meta?.pageNumber ?? 1,
          pageEnd: meta?.pageNumber ?? 1,
          originLines: [{ pageNumber: meta?.pageNumber ?? 1, physicalLine: meta?.physicalLine ?? 1 }],
          descriptionLines: descCell ? [descCell] : [],
          hasExplicitDate: hasDate,
          hasExplicitValue: hasValue,
          isAmbiguous: true,
          ambiguityReasons: [reasonCode]
        };
      }
    }
  }

  // Emite o último bloco pendente
  emitActiveBlock();

  return { merged, blocksClosed, linesAppended, datesInherited };
}
