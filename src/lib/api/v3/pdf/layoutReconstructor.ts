import { PageColumnLayout, PdfPhysicalLine, PdfPhysicalCell } from "./pageLayout";
import { extractDate } from "../enrichment/dateExtractor";
import { parseBrazilianMoney } from "../parsing/moneyParser";

/**
 * Reconstructs a column layout geometrically for a page without a header.
 */
export function reconstructLayoutWithoutHeader(
  pLines: PdfPhysicalLine[],
  pageNumber: number,
  pageWidth: number,
  bankInferred: string | null
): PageColumnLayout | null {
  // 1. Gather all cells from lines that have >= 2 cells (excluding headers/footers/sparse metadata)
  const candidateRows = pLines.filter(line => line.cells.length >= 2);
  
  // Rule: Exigência de linhas suficientes para estabilidade tabular
  const minRowsRequired = bankInferred ? 1 : 3;
  if (candidateRows.length < minRowsRequired) {
    return null;
  }

  // 2. Coletar e agrupar coordenadas X das células para identificar as colunas (eixos horizontais)
  const allXs: number[] = [];
  candidateRows.forEach(line => {
    line.cells.forEach(cell => {
      if (cell.text.trim()) {
        allXs.push(cell.x);
      }
    });
  });

  if (allXs.length === 0) return null;

  // Ordenar e agrupar por proximidade física (tolerância de 15 pontos)
  allXs.sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of allXs) {
    if (clusters.length === 0) {
      clusters.push([x]);
    } else {
      const lastCluster = clusters[clusters.length - 1];
      const lastVal = lastCluster[lastCluster.length - 1];
      if (x - lastVal <= 15) {
        lastCluster.push(x);
      } else {
        clusters.push([x]);
      }
    }
  }

  // Calcular centro médio de cada cluster/coluna
  const colCenters = clusters.map(c => c.reduce((sum, v) => sum + v, 0) / c.length);

  // Se tivermos menos de 2 colunas, não é possível ter data + valor
  if (colCenters.length < 2) return null;

  // 3. Avaliar cada coluna candidata
  const colStats = colCenters.map((center, colIdx) => {
    let dateHits = 0;
    let moneyHits = 0;
    let totalCells = 0;
    let totalLength = 0;

    candidateRows.forEach(line => {
      let closestCell: any = null;
      let minDistance = Infinity;
      line.cells.forEach(cell => {
        const dist = Math.abs(cell.x - center);
        if (dist < minDistance && dist <= 20) {
          minDistance = dist;
          closestCell = cell;
        }
      });

      if (closestCell && closestCell.text.trim()) {
        totalCells++;
        const text = closestCell.text.trim();
        totalLength += text.length;

        // Validar data
        const dt = extractDate(text);
        const hasDatePattern = /^\d{1,2}[\/\-\.\s]\d{1,2}/.test(text) || /^\d{4}-\d{2}-\d{2}/.test(text);
        if (dt && hasDatePattern) {
          dateHits++;
        }

        // Validar monetário usando parseBrazilianMoney
        const parsed = parseBrazilianMoney(text);
        const hasDigits = /\d/.test(text);
        if (parsed.value !== null && hasDigits) {
          moneyHits++;
        }
      }
    });

    const dateRatio = totalCells > 0 ? dateHits / totalCells : 0;
    const moneyRatio = totalCells > 0 ? moneyHits / totalCells : 0;
    const avgLength = totalCells > 0 ? totalLength / totalCells : 0;

    return {
      index: colIdx,
      center,
      dateRatio,
      moneyRatio,
      avgLength,
      totalCells
    };
  });

  // 4. Mapear colunas aos campos canônicos
  const dateColCandidates = colStats.filter(stat => stat.dateRatio >= 0.50);
  if (dateColCandidates.length > 1) {
    return null; // Ambiguity: multiple columns qualify as dates
  }

  let dateColIdx = -1;
  let maxDateRatio = 0;
  colStats.forEach(stat => {
    if (stat.dateRatio >= 0.50 && stat.dateRatio > maxDateRatio) {
      maxDateRatio = stat.dateRatio;
      dateColIdx = stat.index;
    }
  });

  if (dateColIdx === -1) return null;

  const dateColStat = colStats.find(s => s.index === dateColIdx);
  if (dateColStat && dateColStat.moneyRatio >= 0.40) {
    return null; // Ambiguity: date column overlaps with money
  }

  const moneyColIndices: number[] = [];
  let hasMoneyAmbiguity = false;
  colStats.forEach(stat => {
    if (stat.index !== dateColIdx && stat.moneyRatio >= 0.50) {
      if (stat.dateRatio >= 0.40) {
        hasMoneyAmbiguity = true;
      }
      moneyColIndices.push(stat.index);
    }
  });

  if (hasMoneyAmbiguity) {
    return null; // Ambiguity: money column overlaps with dates
  }

  if (moneyColIndices.length === 0) return null;

  // Determinar coluna de descrição (restantes, priorizando texto mais longo)
  let descColIdx = -1;
  let maxAvgLen = -1;
  colStats.forEach(stat => {
    if (stat.index !== dateColIdx && !moneyColIndices.includes(stat.index)) {
      if (stat.avgLength > maxAvgLen) {
        maxAvgLen = stat.avgLength;
        descColIdx = stat.index;
      }
    }
  });

  // Se não houver coluna de descrição identificada, aborta
  if (descColIdx === -1) return null;

  // 5. Montar o layout com nomes correspondentes aos aliases financeiros
  const headers: PageColumnLayout["headers"] = [];
  
  headers.push({
    normalizedName: "data",
    originalName: "data",
    x: colCenters[dateColIdx],
    xRelative: colCenters[dateColIdx] / pageWidth
  });

  headers.push({
    normalizedName: "descrição",
    originalName: "descrição",
    x: colCenters[descColIdx],
    xRelative: colCenters[descColIdx] / pageWidth
  });

  if (moneyColIndices.length === 1) {
    const idx = moneyColIndices[0];
    headers.push({
      normalizedName: "valor",
      originalName: "valor",
      x: colCenters[idx],
      xRelative: colCenters[idx] / pageWidth
    });
  } else if (moneyColIndices.length >= 2) {
    moneyColIndices.sort((a, b) => a - b);
    const balanceIdx = moneyColIndices[moneyColIndices.length - 1];
    
    headers.push({
      normalizedName: "saldo",
      originalName: "saldo",
      x: colCenters[balanceIdx],
      xRelative: colCenters[balanceIdx] / pageWidth
    });

    for (let i = 0; i < moneyColIndices.length - 1; i++) {
      const idx = moneyColIndices[i];
      headers.push({
        normalizedName: i === 0 ? "débito" : "crédito",
        originalName: i === 0 ? "débito" : "crédito",
        x: colCenters[idx],
        xRelative: colCenters[idx] / pageWidth
      });
    }
  }

  // Mapear colunas restantes para outros campos (doc, etc.)
  colStats.forEach(stat => {
    if (stat.index !== dateColIdx && stat.index !== descColIdx && !moneyColIndices.includes(stat.index)) {
      headers.push({
        normalizedName: "documento",
        originalName: "documento",
        x: colCenters[stat.index],
        xRelative: colCenters[stat.index] / pageWidth
      });
    }
  });

  // Ordenar headers por coordenada X
  headers.sort((a, b) => a.x - b.x);

  return {
    pageNumber,
    source: "RECONSTRUCTED_WITHOUT_HEADER",
    pageWidth,
    headers,
    confidence: "HIGH",
    reasons: [`Layout reconstruído sem cabeçalho geometricamente (Banco inferido: ${bankInferred ?? "Desconhecido"}).`]
  };
}
