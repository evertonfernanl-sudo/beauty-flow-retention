// NTIEB Cap. 7, 13, 14, 16.4 — Reconstrução de blocos multi-linha e herança temporal.
//
// Objetivo: uma "linha física" do extrato (linha do PDF, do CSV, do XLSX) nem sempre
// corresponde a 1 lançamento. Uma transação pode ocupar 2–3 linhas físicas (descrição
// quebrada, complemento, código de autenticação, número do documento em linha própria)
// e o pipeline precisa juntá-las antes de aplicar buildCanonical.
//
// Regras (declarativas, sem heurísticas escondidas):
//   1. Uma linha ABRE UM NOVO BLOCO quando:
//      - tem data válida (Cap. 14), OU
//      - o bloco anterior já está "fechado" por ter valor + data válidos.
//   2. Uma linha se ANEXA ao bloco anterior (concatenação de descrição — Cap. 16.4)
//      quando NÃO tem data e NÃO tem valor.
//   3. Uma linha SEM data mas COM valor herda a última data válida (Cap. 14 —
//      contexto temporal herdado).
//   4. Mudança de página nunca fecha um bloco. O blockAssembler recebe o corpo
//      já contínuo (páginas concatenadas) do finalizeTable — Cap. 7.
//
// A saída é 1 linha por bloco, no formato original (string[]), pronta para virar RawRow.

export type BlockAssemblerInput = {
  bodyMatrix: string[][];
  dateIdx: number;              // índice da coluna de data no header (ou -1)
  valueIdxs: number[];          // índices de colunas de valor/débito/crédito
  descIdx: number;              // índice da coluna de descrição (ou -1)
  parseDate: (s: string) => string | null;
};

export type BlockAssemblerOutput = {
  merged: string[][];
  // Estatísticas de auditoria para o pipeline
  blocksClosed: number;
  linesAppended: number;        // quantas linhas foram concatenadas em bloco anterior
  datesInherited: number;       // quantas linhas herdaram data anterior (Cap. 14)
};

export function assembleBlocks(input: BlockAssemblerInput): BlockAssemblerOutput {
  const { bodyMatrix, dateIdx, valueIdxs, descIdx, parseDate } = input;
  const merged: string[][] = [];
  let lastValidDateCell = "";
  let blocksClosed = 0;
  let linesAppended = 0;
  let datesInherited = 0;

  for (const row of bodyMatrix) {
    const dateCell = dateIdx >= 0 ? String(row[dateIdx] ?? "").trim() : "";
    const hasValue = valueIdxs.some((i) => String(row[i] ?? "").trim().length > 0);
    const hasDate = parseDate(dateCell) != null;

    if (hasDate) {
      lastValidDateCell = dateCell;
    }

    // Regra 2 — anexa ao bloco anterior (sem data, sem valor)
    if (!hasDate && !hasValue && merged.length > 0 && descIdx >= 0) {
      const prev = merged[merged.length - 1];
      const extra = row.map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
      if (extra) {
        prev[descIdx] = `${prev[descIdx] ?? ""} ${extra}`.trim();
        linesAppended++;
      }
      continue;
    }

    // Regra 3 — herança temporal (Cap. 14)
    if (!hasDate && hasValue && lastValidDateCell && dateIdx >= 0) {
      row[dateIdx] = lastValidDateCell;
      datesInherited++;
    }

    // Regra 1 — abre novo bloco
    merged.push(row);
    if (hasDate && hasValue) blocksClosed++;
  }

  return { merged, blocksClosed, linesAppended, datesInherited };
}
