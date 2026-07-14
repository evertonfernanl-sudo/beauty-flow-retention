import { PageColumnLayout, PdfPhysicalLine, PdfPhysicalCell, compareDetectedLayouts, validatePageDataAgainstLayout, alignPhysicalCells } from "./pageLayout";
import { detectHeader, mapHeaders, matchCell } from "../headers";
import { extractDate } from "../enrichment/dateExtractor";
import { parseBrazilianMoney } from "../parsing/moneyParser";
import { classifyNonTransactionalRow, RowClassificationContext } from "../rows/nonTransactionalClassifier";

export type NativeExtractorResult = {
  csvText: string;
  pagesClassified: Record<number, "NATIVE">;
  totalPages: number;
  extractedLinesCount: number;
  discardedLinesCount: number;
};

function mostCommon(arr: number[]): number {
  const m = new Map<number, number>();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  let best = 0, count = 0;
  for (const [k, c] of m) if (c > count) { best = k; count = c; }
  return best;
}

function escapeCsvCell(cell: string | null | undefined): string {
  if (cell == null) return "";
  const clean = String(cell).trim();
  if (clean.includes(";") || clean.includes('"') || clean.includes("\n") || clean.includes("\r")) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

function formatBrNumber(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "";
  return val.toFixed(2).replace(".", ",");
}

/**
 * Extracts native text pages from a PDF proxy and builds the Canonical CSV structure.
 * This flow is 100% deterministic (no AI/LLM fallback allowed).
 */
export async function extractNativePdfToCsv(
  pdfProxy: any,
  args: {
    fileHash: string;
    nativePages: number[];
  }
): Promise<NativeExtractorResult> {
  const perPage: Array<Array<Array<{ text: string; x: number; y: number; pageNumber: number; pageWidth: number; physicalLine: number; width?: number }>>> = [];
  const pagesMap = new Map<number, PdfPhysicalLine[]>();
  const totalPages = pdfProxy.numPages;

  // 1. Gather all text elements from native pages
  for (const p of args.nativePages) {
    const page = await pdfProxy.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;

    const items: Array<{ str: string; x: number; y: number; w: number }> = (content.items ?? [])
      .filter((it: any) => it && typeof it.str === "string" && it.str.trim().length > 0)
      .map((it: any) => ({
        str: String(it.str),
        x: Array.isArray(it.transform) ? Number(it.transform[4]) : 0,
        y: Array.isArray(it.transform) ? Number(it.transform[5]) : 0,
        w: typeof it.width === "number" ? it.width : 0,
      }));

    // Group items by Y coordinate (median font height tolerance = 3.0)
    const yTol = 3.0;
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Array<Array<{ str: string; x: number; y: number; w: number }>> = [];
    let currentY: number | null = null;
    let current: Array<{ str: string; x: number; y: number; w: number }> = [];

    for (const it of sorted) {
      if (currentY == null || Math.abs(currentY - it.y) <= yTol) {
        current.push({ str: it.str, x: it.x, y: it.y, w: it.w });
        currentY = currentY == null ? it.y : (currentY + it.y) / 2;
      } else {
        lines.push(current);
        current = [{ str: it.str, x: it.x, y: it.y, w: it.w }];
        currentY = it.y;
      }
    }
    if (current.length) lines.push(current);

    // Form cells by grouping tokens with X gap < 8
    const xGap = 8;
    const matrix: Array<Array<{ text: string; x: number; y: number; pageNumber: number; pageWidth: number; physicalLine: number; width?: number }>> = [];
    let physicalLineCounter = 1;

    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const cells: Array<{ text: string; x: number; y: number; pageNumber: number; pageWidth: number; physicalLine: number; width?: number }> = [];
      let buf = "";
      let startX = -1;
      let startY = -1;
      let lastX = -Infinity;

      for (const t of line) {
        if (buf === "") {
          buf = t.str;
          startX = t.x;
          startY = t.y;
          lastX = t.x + (t.w || t.str.length * 6);
          continue;
        }
        if (t.x - lastX > xGap) {
          cells.push({
            text: buf.trim(),
            x: startX,
            y: startY,
            width: lastX - startX,
            pageNumber: p,
            pageWidth: pageWidth,
            physicalLine: physicalLineCounter
          });
          buf = t.str;
          startX = t.x;
          startY = t.y;
        } else {
          buf += " " + t.str;
        }
        lastX = t.x + (t.w || t.str.length * 6);
      }
      if (buf) {
        cells.push({
          text: buf.trim(),
          x: startX,
          y: startY,
          width: lastX - startX,
          pageNumber: p,
          pageWidth: pageWidth,
          physicalLine: physicalLineCounter
        });
      }
      if (cells.some((c) => c.text.length > 0)) {
        matrix.push(cells);
        physicalLineCounter++;
      }
    }

    perPage.push(matrix);
    pagesMap.set(p, matrix.map(row => ({
      pageNumber: p,
      physicalLine: row[0]?.physicalLine ?? 1,
      y: row[0]?.y ?? 0,
      pageWidth: pageWidth,
      cells: row as PdfPhysicalCell[]
    })));
  }

  // 2. Detect Page Layouts
  const detectedPageLayouts = new Map<number, PageColumnLayout>();
  const headerIndicesPerPage = new Map<number, number>();
  let primaryLayout: PageColumnLayout | null = null;

  for (const pNum of args.nativePages) {
    const pLines = pagesMap.get(pNum)!;
    const stringMatrixOfPage = pLines.map(line => line.cells.map(c => c.text));
    const detection = detectHeader(stringMatrixOfPage, "pdf");

    if (detection.headerIndex >= 0 && !detection.headerFailed) {
      const headerRow = pLines[detection.headerIndex];
      const rawHeaders = headerRow.cells.map((h, i) => String(h.text ?? `col_${i}`).trim() || `col_${i}`);
      
      const pageLayout: PageColumnLayout = {
        pageNumber: pNum,
        source: "DETECTED_HEADER",
        pageWidth: headerRow.pageWidth,
        headers: headerRow.cells.map((cell, idx) => {
          const name = rawHeaders[idx];
          return {
            originalName: name,
            normalizedName: name.toLowerCase().trim(),
            x: cell.x,
            xRelative: cell.x / headerRow.pageWidth,
            width: cell.width
          };
        }) as any,
        confidence: "HIGH",
        reasons: ["Cabeçalho detectado na página."]
      };
      detectedPageLayouts.set(pNum, pageLayout);
      headerIndicesPerPage.set(pNum, detection.headerIndex);
      if (!primaryLayout) {
        primaryLayout = pageLayout;
      }
    }
  }

  // If no primary header layout was detected at all, abort nativa
  if (!primaryLayout) {
    throw new Error("Erro na extração nativa: Cabeçalho estrutural não identificado em nenhuma página nativa.");
  }

  const rawHeaders = primaryLayout.headers.map((h: any) => h.originalName);
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h}__${n}`;
  });

  // Second pass: resolve pages without headers
  for (const pNum of args.nativePages) {
    const pLines = pagesMap.get(pNum)!;
    let pageLayout = detectedPageLayouts.get(pNum);

    if (!pageLayout) {
      let prevLayout: PageColumnLayout | null = null;
      for (let prevP = pNum - 1; prevP >= 1; prevP--) {
        const l = detectedPageLayouts.get(prevP);
        if (l && l.source !== "UNRESOLVED") {
          prevLayout = l;
          break;
        }
      }

      if (prevLayout) {
        const resolved = validatePageDataAgainstLayout(pLines, prevLayout, pNum, pLines[0].pageWidth);
        detectedPageLayouts.set(pNum, resolved);
      } else {
        const unresolved: PageColumnLayout = {
          pageNumber: pNum,
          source: "UNRESOLVED",
          pageWidth: pLines[0].pageWidth,
          headers: primaryLayout.headers as any,
          confidence: "LOW",
          reasons: ["Sem layout anterior para reutilizar."]
        };
        detectedPageLayouts.set(pNum, unresolved);
      }
    }
  }

  // 3. Resolve rows and map to Canonical fields
  const { map, extraConcat } = mapHeaders(headers);
  const getFieldVal = (rowObj: Record<string, string>, f: string) => {
    const colKey = map[f as keyof typeof map];
    return colKey ? rowObj[colKey] ?? "" : "";
  };

  const csvRows: string[] = [];
  // Write header row
  csvRows.push("date;description;amount;debit;credit;balance;doc;client_name;cpf_cnpj;phone;movement_type;page;origin_lines");

  let extractedLinesCount = 0;
  let discardedLinesCount = 0;
  const pagesClassified: Record<number, "NATIVE"> = {};

  for (const pNum of args.nativePages) {
    pagesClassified[pNum] = "NATIVE";
    const pLines = pagesMap.get(pNum)!;
    const pageLayout = detectedPageLayouts.get(pNum)!;
    const headerIdx = headerIndicesPerPage.get(pNum) ?? -1;

    // Check if layout resolver failed and abort page/document as required by rules
    if (pageLayout.source === "UNRESOLVED") {
      throw new Error(`Erro estrutural de alinhamento: Não foi possível determinar o layout de colunas da página nativa ${pNum}.`);
    }

    for (let i = 0; i < pLines.length; i++) {
      const line = pLines[i];
      
      // Discard header rows
      if (pageLayout.source === "DETECTED_HEADER" && i === headerIdx) {
        discardedLinesCount++;
        continue;
      }

      // Project physical line cells to headers
      const rowObj: Record<string, string> = {};
      const alignedCells = alignPhysicalCells(line, pageLayout);
      headers.forEach((h, idx) => {
        rowObj[h] = alignedCells[idx] ?? "";
      });

      // Classify line to discard non-transactional content (saldos, rodapés, institutional)
      const cellTexts = headers.map(h => rowObj[h]);
      const context: RowClassificationContext = {
        source: "pdf",
        pageNumber: line.pageNumber,
        physicalLine: line.physicalLine,
        isFirstUsefulLineOfPage: i === 0 || (i === 1 && headerIdx === 0),
        isLastUsefulLineOfPage: i === pLines.length - 1,
        knownHeaders: headers
      };
      
      const classification = classifyNonTransactionalRow(cellTexts, context);
      if (!classification.isTransactionalCandidate) {
        discardedLinesCount++;
        continue;
      }

      // Description special logic (Histórico + Complemento concatenation)
      let description = getFieldVal(rowObj, "description").trim();
      if (extraConcat && extraConcat.field === "description") {
        const [a, b] = extraConcat.cols;
        const va = String(rowObj[a] ?? "").trim();
        const vb = String(rowObj[b] ?? "").trim();
        if (va && vb) description = `${va} - ${vb}`;
        else description = va || vb;
      }

      // Normalization of values
      const dateRaw = getFieldVal(rowObj, "transaction_date");
      const dateNormalized = extractDate(dateRaw) || "";

      // Clean/normalise money fields
      const amountRaw = getFieldVal(rowObj, "amount");
      const debitRaw = getFieldVal(rowObj, "debit_amount");
      const creditRaw = getFieldVal(rowObj, "credit_amount");
      const balanceRaw = getFieldVal(rowObj, "balance");

      const amountParsed = parseBrazilianMoney(amountRaw).value;
      const debitParsed = parseBrazilianMoney(debitRaw).value;
      const creditParsed = parseBrazilianMoney(creditRaw).value;
      const balanceParsed = parseBrazilianMoney(balanceRaw).value;

      const dateCsv = dateNormalized;
      const descCsv = description;
      const amountCsv = formatBrNumber(amountParsed);
      const debitCsv = formatBrNumber(debitParsed);
      const creditCsv = formatBrNumber(creditParsed);
      const balanceCsv = formatBrNumber(balanceParsed);
      const docCsv = getFieldVal(rowObj, "document_number");
      const clientNameCsv = getFieldVal(rowObj, "client_name");
      const cpfCnpjCsv = getFieldVal(rowObj, "cpf_cnpj");
      const phoneCsv = getFieldVal(rowObj, "phone");
      const movementTypeCsv = getFieldVal(rowObj, "movement_type");
      
      const pageCsv = String(pNum);
      const originLinesCsv = JSON.stringify([`${pNum}:${line.physicalLine}`]);

      // Format canonical row
      const csvLine = [
        escapeCsvCell(dateCsv),
        escapeCsvCell(descCsv),
        amountCsv,
        debitCsv,
        creditCsv,
        balanceCsv,
        escapeCsvCell(docCsv),
        escapeCsvCell(clientNameCsv),
        escapeCsvCell(cpfCnpjCsv),
        escapeCsvCell(phoneCsv),
        escapeCsvCell(movementTypeCsv),
        pageCsv,
        escapeCsvCell(originLinesCsv)
      ].join(";");

      csvRows.push(csvLine);
      extractedLinesCount++;
    }
  }

  return {
    csvText: csvRows.join("\n"),
    pagesClassified,
    totalPages,
    extractedLinesCount,
    discardedLinesCount
  };
}
