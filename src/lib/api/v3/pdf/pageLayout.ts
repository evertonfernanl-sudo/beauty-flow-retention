export type PdfPhysicalCell = {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  pageNumber: number;
  pageWidth: number;
  pageHeight?: number;
};

export type PdfPhysicalLine = {
  pageNumber: number;
  physicalLine: number;
  y: number;
  pageWidth: number;
  cells: PdfPhysicalCell[];
};

export type PageColumnLayout = {
  pageNumber: number;
  source: "DETECTED_HEADER" | "REUSED_PREVIOUS" | "INFERRED_GEOMETRY" | "UNRESOLVED" | "RECONSTRUCTED_WITHOUT_HEADER";
  pageWidth: number;
  headers: Array<{
    originalName?: string;
    normalizedName: string;
    x: number;
    xRelative: number;
    width?: number;
  }>;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  equivalentToPage?: number;
  appliedOffset?: number;
  offsetResidual?: number;
  compatibleRowRatio?: number;
  reasons: string[];
};

export const LAYOUT_TOLERANCE = {
  maxRelativeColumnDrift: 0.04, // 4% da largura da página
  maxOffsetResidual: 4.0,       // 4.0 points absolutos
  minCompatibleRowRatio: 0.50,  // Ao menos 50% das linhas compatíveis
  maxBoundaryAmbiguity: 0.02,   // 2% de tolerância na fronteira
};

export function compareDetectedLayouts(
  layoutA: PageColumnLayout,
  layoutB: PageColumnLayout
): boolean {
  if (layoutA.headers.length !== layoutB.headers.length) return false;

  for (let i = 0; i < layoutA.headers.length; i++) {
    const hA = layoutA.headers[i];
    const hB = layoutB.headers[i];
    
    if (hA.normalizedName !== hB.normalizedName) return false;
    
    const relativeDrift = Math.abs(hA.xRelative - hB.xRelative);
    if (relativeDrift > LAYOUT_TOLERANCE.maxRelativeColumnDrift) {
      return false;
    }
  }
  return true;
}

export function validatePageDataAgainstLayout(
  lines: PdfPhysicalLine[],
  previousLayout: PageColumnLayout,
  currentPageNumber: number,
  currentPageWidth: number
): PageColumnLayout {
  const reasons: string[] = [];
  if (lines.length === 0) {
    return {
      pageNumber: currentPageNumber,
      source: "REUSED_PREVIOUS",
      pageWidth: currentPageWidth,
      headers: previousLayout.headers.map(h => ({
        ...h,
        x: h.xRelative * currentPageWidth,
        xRelative: h.xRelative
      })),
      confidence: "HIGH",
      equivalentToPage: previousLayout.pageNumber,
      appliedOffset: 0,
      offsetResidual: 0,
      compatibleRowRatio: 1.0,
      reasons: ["Sem linhas físicas na página, layout reutilizado por omissão."]
    };
  }

  // 1. Coleta de potenciais deslocamentos (offsets) para todas as células da página
  const diffs: number[] = [];
  for (const line of lines) {
    for (const cell of line.cells) {
      // Encontra a coluna mais próxima no layout anterior (usando a coordenada relativa)
      let closestColIdx = 0;
      let minDiff = Infinity;
      for (let j = 0; j < previousLayout.headers.length; j++) {
        const colRelativeX = previousLayout.headers[j].xRelative;
        const colAbsoluteX = colRelativeX * currentPageWidth;
        const diff = cell.x - colAbsoluteX;
        if (Math.abs(diff) < Math.abs(minDiff)) {
          minDiff = diff;
          closestColIdx = j;
        }
      }
      diffs.push(minDiff);
    }
  }

  // 2. Calcula a mediana dos offsets para obter o deslocamento uniforme (appliedOffset)
  diffs.sort((a, b) => a - b);
  const medianOffset = diffs.length > 0 ? diffs[Math.floor(diffs.length / 2)] : 0;

  // 3. Validação das linhas com base no offset calculado
  let compatibleRowCount = 0;
  let totalResidualSum = 0;
  let countedCellsCount = 0;

  for (const line of lines) {
    let lineCompatible = true;
    for (const cell of line.cells) {
      // Encontra a coluna correspondente com o offset aplicado
      let closestColIdx = 0;
      let minDiff = Infinity;
      for (let j = 0; j < previousLayout.headers.length; j++) {
        const colAbsoluteX = previousLayout.headers[j].xRelative * currentPageWidth + medianOffset;
        const diff = cell.x - colAbsoluteX;
        if (Math.abs(diff) < Math.abs(minDiff)) {
          minDiff = diff;
          closestColIdx = j;
        }
      }
      
      const residual = Math.abs(minDiff);
      totalResidualSum += residual;
      countedCellsCount++;

      if (residual > LAYOUT_TOLERANCE.maxOffsetResidual) {
        lineCompatible = false;
      }
    }
    if (lineCompatible) {
      compatibleRowCount++;
    }
  }

  const compatibleRowRatio = lines.length > 0 ? compatibleRowCount / lines.length : 1.0;
  const avgResidual = countedCellsCount > 0 ? totalResidualSum / countedCellsCount : 0;

  // 4. Decisão de compatibilidade
  const isCompatible =
    compatibleRowRatio >= LAYOUT_TOLERANCE.minCompatibleRowRatio &&
    avgResidual <= LAYOUT_TOLERANCE.maxOffsetResidual;

  if (isCompatible) {
    reasons.push(`Layout compatível com página ${previousLayout.pageNumber}. Proporção de linhas compatíveis: ${(compatibleRowRatio * 100).toFixed(0)}%. Desvio médio: ${avgResidual.toFixed(1)}pt.`);
    return {
      pageNumber: currentPageNumber,
      source: "REUSED_PREVIOUS",
      pageWidth: currentPageWidth,
      headers: previousLayout.headers.map(h => ({
        ...h,
        x: h.xRelative * currentPageWidth + medianOffset,
        xRelative: h.xRelative
      })),
      confidence: "HIGH",
      equivalentToPage: previousLayout.pageNumber,
      appliedOffset: medianOffset,
      offsetResidual: avgResidual,
      compatibleRowRatio,
      reasons
    };
  } else {
    reasons.push(`Layout incompatível com página ${previousLayout.pageNumber}. Linhas compatíveis: ${(compatibleRowRatio * 100).toFixed(0)}% < ${(LAYOUT_TOLERANCE.minCompatibleRowRatio * 100).toFixed(0)}%. Desvio: ${avgResidual.toFixed(1)}pt.`);
    return {
      pageNumber: currentPageNumber,
      source: "UNRESOLVED",
      pageWidth: currentPageWidth,
      headers: previousLayout.headers.map(h => ({
        ...h,
        x: h.xRelative * currentPageWidth,
        xRelative: h.xRelative
      })),
      confidence: "LOW",
      equivalentToPage: undefined,
      appliedOffset: 0,
      offsetResidual: avgResidual,
      compatibleRowRatio,
      reasons
    };
  }
}

export function alignPhysicalCells(
  line: PdfPhysicalLine,
  layout: PageColumnLayout
): string[] {
  const alignedRow = new Array(layout.headers.length).fill("");
  if (layout.headers.length === 0) return alignedRow;

  // 1. Calcula os limites (boundaries) entre as colunas do layout
  const boundaries: number[] = [];
  for (let i = 0; i < layout.headers.length - 1; i++) {
    const currentX = layout.headers[i].x;
    const nextX = layout.headers[i + 1].x;
    boundaries.push((currentX + nextX) / 2);
  }

  // 2. Distribui cada célula física na coluna adequada
  for (const cell of line.cells) {
    if (!cell.text) continue;

    // Determina o ponto horizontal de ancoragem da célula
    // Se for um item curto (width < 80, ex: data ou valor), usa o centro geométrico;
    // caso contrário (itens longos como descrição ou linhas administrativas), usa o X inicial
    const xAnchor = cell.width && cell.width > 0 && cell.width < 80 ? cell.x + cell.width / 2 : cell.x;

    // Encontra o índice da coluna com base nos boundaries
    let colIdx = 0;
    while (colIdx < boundaries.length && xAnchor > boundaries[colIdx]) {
      colIdx++;
    }

    // 3. Prevenção de colisões em fronteiras para textos longos (descrição)
    // Se o item caiu em uma coluna numérica/data, mas é um texto longo alfabético,
    // e o layout tem coluna de descrição, tenta forçar para a coluna de descrição
    const isLongText = cell.text.length > 12 && /[a-zA-Z]{5,}/.test(cell.text);
    if (isLongText) {
      const descColIdx = layout.headers.findIndex(h => h.normalizedName === "descricao" || h.normalizedName === "historico");
      if (descColIdx >= 0 && colIdx !== descColIdx) {
        // Se a célula cruza ou está muito próxima da fronteira da descrição
        const descColX = layout.headers[descColIdx].x;
        const drift = Math.abs(cell.x - descColX) / cell.pageWidth;
        if (drift < 0.15) { // tolerância de drift de até 15% da largura da página para texto longo
          colIdx = descColIdx;
        }
      }
    }

    // 4. Junta os textos se mais de um token cair na mesma coluna
    if (alignedRow[colIdx]) {
      alignedRow[colIdx] += " " + cell.text;
    } else {
      alignedRow[colIdx] = cell.text;
    }
  }

  return alignedRow;
}
