// SIE V3 — Pipeline determinístico. Server-only.
// Fidelidade absoluta ao arquivo. Snapshot bruto imutável. Estado final via Máquina de Estados (Cap. 37).

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { detectHeader, mapHeaders, matchCell, isSummaryOrBalanceRow } from "./headers";
import { enrichRow, detectDirection, extractDate, extractClient, detectTransactionPattern, normalizeDescription, type TransactionPatternKey } from "./enrichment";
import { SUBTYPE_KEYWORDS } from "./enrichment/aliases";
import {
  NTIEB_VERSION,
  PARSER_VERSION,
  PATTERN_TO_MATRIX,
  toConfidenceLevel,
  toHomologationStatus,
  requiresManualReview,
  formatRuleApplied,
} from "./ntieb/rules";
import { assembleBlocks } from "./blocks/blockAssembler";
import { captureExtractSummary, validateBalance, type ExtractSummary } from "./validation/balanceValidator";
import { IssuerBank, inferIssuerBank, getHumanBankName } from "./banks/issuerBank";
import { PageColumnLayout, PdfPhysicalLine, PdfPhysicalCell, compareDetectedLayouts, validatePageDataAgainstLayout, alignPhysicalCells } from "./pdf/pageLayout";
import { classifyNonTransactionalRow, RowClassificationContext } from "./rows/nonTransactionalClassifier";
import { applyTemporalContextToBlocks } from "./temporal/temporalContext";
import { evaluateRowQuality } from "./confidence/confidenceCalculator";
import { ImportAuditCollector } from "./audit/auditCollector";
import { detectDelimitedTextStructure } from "./parsing/delimitedTextDetector";
import { parseBrazilianMoney } from "./parsing/moneyParser";
import { generateAuditTextReport } from "./audit/auditReport";
import { classifyPage } from "./pdf/pageClassifier";
import { extractNativePdfToCsv } from "./pdf/nativeExtractor";
import { extractOcrPageToCsv } from "./pdf/ocrExtractor";
import { validateCanonicalCsv } from "./parsing/csvValidator";
import { reconstructLayoutWithoutHeader } from "./pdf/layoutReconstructor";

type SB = SupabaseClient<Database>;

export const V3_ALGORITHM_VERSION = "v3.0.0";

const PROTECTED_FIELDS = [
  "client_name", "description", "amount", "transaction_date",
  "balance", "document_number", "cpf_cnpj", "phone",
] as const;

const SUMMARY_KEYWORDS = [
  "saldo do dia", "saldo dia", "saldo anterior", "saldo inicial", "saldo final",
  "saldo c/a", "saldo c.a", "saldo c/c", "saldo após operação", "saldo apos operacao",
  "saldo após transação", "saldo apos transacao", "saldo",
  "total", "totais", "total de creditos", "total de créditos",
  "total de debitos", "total de débitos", "total geral", "resumo", "resumo do periodo", "resumo do período"
];

// ============================================================
// Tipos
// ============================================================

export type RawRow = Record<string, string>;
export type RawTable = {
  headers: string[];
  rows: RawRow[];
  meta: Record<string, unknown>;
  charset?: string;
  ocrConfidence?: number;
  headerFailed?: boolean;
  extractSummary?: ExtractSummary; // NTIEB Cap. 15.3 / 55
};

export type CanonicalRow = {
  client_name: string | null;
  description: string | null;
  amount: number | null;
  transaction_date: string | null; // YYYY-MM-DD
  balance: number | null;
  document_number: string | null;
  cpf_cnpj: string | null;
  phone: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  movement_type: string | null; // C, D, PIX, TED etc. — como veio
  raw_extra: Record<string, string>;
};

export type FieldMap = Partial<Record<keyof CanonicalRow, string>>;
export type LineStatus = "OK" | "LINE_FAILED" | "LINE_REVIEW";
export type FinalState = "SUCCESS" | "PARTIAL_SUCCESS" | "REVIEW" | "FAILED";

// ============================================================
// Utilitário — hash SHA-256 do arquivo original
// ============================================================

async function sha256Hex(buf: Uint8Array): Promise<string> {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const h = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// Camada 2 — Conversão
// CSV/XLS: charset determinístico UTF-8 → ISO-8859-1 → Windows-1252
// ============================================================

const CHARSETS = ["utf-8", "iso-8859-1", "windows-1252"] as const;

function decodeDeterministic(buffer: Uint8Array): { text: string; charset: string; hadReplacements: boolean } {
  for (const cs of CHARSETS) {
    try {
      const text = new TextDecoder(cs, { fatal: true }).decode(buffer);
      return { text, charset: cs, hadReplacements: false };
    } catch { /* tenta próximo */ }
  }
  // fallback: windows-1252 tolerante (substitui indecifráveis por U+FFFD)
  const text = new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
  return { text, charset: "windows-1252", hadReplacements: text.includes("\uFFFD") };
}

export function parseCsv(buffer: Uint8Array, collector?: ImportAuditCollector): RawTable {
  const { text, charset } = decodeDeterministic(buffer);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const matrix = (parsed.data ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (collector) {
    collector.increment("physical_lines_extracted", matrix.length);
  }
  return finalizeTable(matrix, { source: "csv" }, charset, collector);
}

export function parseXlsx(buffer: Uint8Array, collector?: ImportAuditCollector): RawTable {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const clean = matrix.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (collector) {
    collector.increment("physical_lines_extracted", clean.length);
  }
  return finalizeTable(clean, { source: "xlsx", sheet: wb.SheetNames[0] }, "utf-8", collector);
}

// PDF — reconstrução tabular via pdfjs-dist (unpdf) usando coordenadas X/Y.
// - Agrupa itens por Y (mesma linha visual) e ordena por X (colunas).
// - Se a página tiver texto insuficiente, marca imagePages para fallback OCR (Cap. 24.5–24.6).
export async function parsePdf(buffer: Uint8Array, collector?: ImportAuditCollector): Promise<RawTable> {
  const cleanBuffer = new Uint8Array(buffer.length);
  cleanBuffer.set(buffer);
  const unpdf: any = await import("unpdf");
  const pdf = await unpdf.getDocumentProxy(cleanBuffer);
  const perPage: Array<Array<Array<{ text: string; x: number; y: number; pageNumber: number; pageWidth: number; physicalLine: number; width?: number }>>> = [];
  const imagePages: number[] = [];
  let totalCellsEst = 0, totalCellsGot = 0;

  const numPages = pdf.numPages;
  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    const items: Array<{ str: string; x: number; y: number; w: number }> = (content.items ?? [])
      .filter((it: any) => it && typeof it.str === "string" && it.str.trim().length > 0)
      .map((it: any) => ({
        str: String(it.str),
        x: Array.isArray(it.transform) ? Number(it.transform[4]) : 0,
        y: Array.isArray(it.transform) ? Number(it.transform[5]) : 0,
        w: typeof it.width === "number" ? it.width : 0,
      }));

    // Texto insuficiente → provável página imagem/scan → candidata a OCR
    const totalChars = items.reduce((s, it) => s + it.str.replace(/\s+/g, "").length, 0);
    if (items.length < 5 || totalChars < 20) {
      imagePages.push(p);
      continue;
    }

    // Agrupa por linha (Y). Tolerância = mediana da altura de fonte estimada.
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

    // Colunas por gaps de X: agrupa tokens contíguos com gap < xGap; separa em células.
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

    const modeCols = mostCommon(matrix.map((r) => r.length));
    totalCellsEst += matrix.length * Math.max(modeCols, 1);
    totalCellsGot += matrix.reduce((s, r) => s + r.length, 0);
    perPage.push(matrix);
  }

  const merged: Array<Array<{ text: string; x: number; y: number; pageNumber: number; pageWidth: number; physicalLine: number; width?: number }>> = [];
  for (const page of perPage) merged.push(...page);
  const confidence = totalCellsEst > 0 ? Math.min(1, totalCellsGot / totalCellsEst) : 0;

  const meta: Record<string, unknown> = { source: "pdf", pages: numPages, imagePages };
  if (merged.length === 0) {
    return { headers: [], rows: [], meta, charset: "utf-8", headerFailed: true, ocrConfidence: 0 };
  }

  if (collector) {
    collector.increment("physical_lines_extracted", merged.length);
  }
  const table = finalizeTable(merged, meta, "utf-8", collector);
  table.ocrConfidence = confidence;
  (table.meta as any).imagePages = imagePages;
  return table;
}

function finalizeTable(
  matrix: Array<Array<string | { text: string; x: number; y?: number; pageNumber?: number; pageWidth?: number; physicalLine?: number; width?: number }>>,
  meta: Record<string, unknown>,
  charset: string,
  collector?: ImportAuditCollector
): RawTable {
  if (matrix.length === 0) return { headers: [], rows: [], meta, charset, headerFailed: true };

  const getCellText = (cell: any): string => {
    if (cell == null) return "";
    if (typeof cell === "string") return cell;
    return cell.text ?? "";
  };

  const getCellX = (cell: any): number => {
    if (cell == null || typeof cell === "string") return 0;
    return cell.x ?? 0;
  };

  // Busca do cabeçalho global
  const stringMatrix = matrix.map((row) => row.map((c) => getCellText(c)));
  const globalDetection = detectHeader(stringMatrix, meta?.source as string);
  const globalHeaderIdx = globalDetection.headerIndex;

  const isCoordinateBased = globalHeaderIdx >= 0 && matrix[globalHeaderIdx].some(h => typeof h !== "string");

  if (!isCoordinateBased) {
    // Fluxos CSV, XLSX ou OCR (não baseados em coordenadas/viewport)
    if (globalHeaderIdx < 0 || globalDetection.headerFailed) {
      return { headers: [], rows: [], meta, charset, headerFailed: true };
    }

    const rawHeaders = matrix[globalHeaderIdx].map((h, i) => String(getCellText(h) ?? `col_${i}`).trim() || `col_${i}`);
    const seen = new Map<string, number>();
    const headers = rawHeaders.map((h) => {
      const n = (seen.get(h) ?? 0) + 1;
      seen.set(h, n);
      return n === 1 ? h : `${h}__${n}`;
    });

    const bodyMatrix = matrix.slice(globalHeaderIdx + 1);
    const headerSignature = rawHeaders.map((c) => String(c ?? "").trim().toLowerCase()).filter(Boolean).join("|");

    const filteredBodyMatrix: string[][] = [];
    const summaryRows: string[][] = [];
    const filtered_rows: any[] = [];
    let row_idx = 0;

    let rows_before_phase3 = bodyMatrix.length;
    let rows_after_phase3 = 0;
    let rows_removed_by_phase3 = 0;

    let empty_lines_discarded = 0;
    let metadata_lines_discarded = 0;
    let repeated_headers_discarded = 0;
    let footer_lines_discarded = 0;
    let institutional_lines_discarded = 0;
    let balance_lines_captured = 0;
    let summary_lines_captured = 0;
    let total_lines_captured = 0;
    let ambiguous_rows_forwarded_or_reviewed = 0;
    let transaction_candidate_rows_forwarded = 0;

    const pageColIdx = headers.findIndex((h) => h === "page");
    const originLinesColIdx = headers.findIndex((h) => h === "origin_lines");
    const filteredMetadata: any[] = [];

    if (collector) {
      collector.recordPageLayout({
        pageNumber: 1,
        layoutSource: "DETECTED_HEADER",
        layoutConfidence: "HIGH",
        reasons: ["Mapeamento padrão de colunas CSV/XLSX/OCR."]
      });
    }

    for (const row of bodyMatrix) {
      const rowSig = row.map((c) => String(getCellText(c) ?? "").trim().toLowerCase()).filter(Boolean).join("|");
      
      row_idx++;
      let pageNumber = 1;
      let physicalLine = row_idx;
      if (pageColIdx >= 0 && row[pageColIdx]) {
        pageNumber = parseInt(String(getCellText(row[pageColIdx])), 10) || 1;
      }
      if (originLinesColIdx >= 0 && row[originLinesColIdx]) {
        try {
          const originArr = JSON.parse(String(getCellText(row[originLinesColIdx])));
          if (Array.isArray(originArr) && originArr[0]) {
            physicalLine = parseInt(originArr[0].split(":")[1], 10) || physicalLine;
          }
        } catch {}
      }

      if (headerSignature && rowSig === headerSignature) {
        repeated_headers_discarded++;
        rows_removed_by_phase3++;
        if (collector) {
          collector.recordPhase3Row({
            pageNumber,
            physicalLine,
            category: "REPEATED_HEADER",
            action: "DISCARD_BEFORE_BLOCKS",
            reasonCode: "REPEATED_HEADER_LINE",
            confidence: "HIGH",
            matchedSignals: ["REPEATED_HEADER"],
            textPreview: row.map(getCellText).join(" | ")
          });
        }
        continue;
      }

      const cellTexts = row.map((c) => getCellText(c));
      const context: RowClassificationContext = {
        source: meta?.source as string || "csv",
        knownHeaders: headers
      };
      const classification = classifyNonTransactionalRow(cellTexts, context);

      if (collector) {
        collector.recordPhase3Row({
          pageNumber,
          physicalLine,
          category: classification.category,
          action: classification.action,
          reasonCode: classification.reasonCode,
          confidence: classification.confidence,
          matchedSignals: classification.matchedSignals,
          textPreview: cellTexts.join(" | ")
        });
      }

      if (classification.preserveForAudit) {
        filtered_rows.push({
          pageNumber,
          physicalLine,
          category: classification.category,
          action: classification.action,
          reasonCode: classification.reasonCode,
          reasons: classification.reasons,
          originalText: cellTexts.join(" | ")
        });
      }

      if (classification.category === "EMPTY") empty_lines_discarded++;
      else if (classification.category === "METADATA") metadata_lines_discarded++;
      else if (classification.category === "REPEATED_HEADER") repeated_headers_discarded++;
      else if (classification.category === "FOOTER") footer_lines_discarded++;
      else if (classification.category === "INSTITUTIONAL") institutional_lines_discarded++;
      else if (classification.category === "BALANCE") balance_lines_captured++;
      else if (classification.category === "SUMMARY") summary_lines_captured++;
      else if (classification.category === "TOTAL") total_lines_captured++;
      else if (classification.category === "AMBIGUOUS") ambiguous_rows_forwarded_or_reviewed++;
      else if (classification.category === "TRANSACTION_CANDIDATE") transaction_candidate_rows_forwarded++;

      switch (classification.action) {
        case "DISCARD_BEFORE_BLOCKS":
          rows_removed_by_phase3++;
          break;
        case "CAPTURE_AS_BALANCE":
        case "CAPTURE_AS_SUMMARY":
        case "CAPTURE_AS_TOTAL":
          summaryRows.push(cellTexts);
          rows_removed_by_phase3++;
          break;
        case "FORWARD_TO_BLOCK_ASSEMBLER":
        case "KEEP_FOR_REVIEW":
          filteredBodyMatrix.push(cellTexts);
          filteredMetadata.push({
            pageNumber,
            physicalLine,
            pageLayoutResolved: meta?.source !== "UNRESOLVED"
          });
          rows_after_phase3++;
          break;
      }
    }

    meta.rows_before_phase3 = rows_before_phase3;
    meta.rows_after_phase3 = rows_after_phase3;
    meta.rows_removed_by_phase3 = rows_removed_by_phase3;
    meta.empty_lines_discarded = empty_lines_discarded;
    meta.metadata_lines_discarded = metadata_lines_discarded;
    meta.repeated_headers_discarded = repeated_headers_discarded;
    meta.footer_lines_discarded = footer_lines_discarded;
    meta.institutional_lines_discarded = institutional_lines_discarded;
    meta.balance_lines_captured = balance_lines_captured;
    meta.summary_lines_captured = summary_lines_captured;
    meta.total_lines_captured = total_lines_captured;
    meta.ambiguous_rows_forwarded_or_reviewed = ambiguous_rows_forwarded_or_reviewed;
    meta.transaction_candidate_rows_forwarded = transaction_candidate_rows_forwarded;

    const dateIdx = headers.findIndex((h) => matchCell(h)?.field === "transaction_date");
    const valueIdxs = headers.map((h, i) => {
      const field = matchCell(h)?.field;
      if (field === "amount" || field === "debit_amount" || field === "credit_amount") return i;
      return -1;
    }).filter((i) => i >= 0);
    const descIdx = headers.findIndex((h) => matchCell(h)?.field === "description");

    const assembled = assembleBlocks({
      bodyMatrix: filteredBodyMatrix,
      dateIdx,
      valueIdxs,
      descIdx,
      parseDate,
      lineMetadata: filteredMetadata,
    });

    if (collector) {
      let blockCounter = 1;
      for (const block of assembled.blocks || []) {
        const pageStart = block.pageStart ?? 1;
        const pageEnd = block.pageEnd ?? 1;
        const blockId = `${pageStart}-${block.originLines[0]?.physicalLine ?? blockCounter}-${blockCounter}`;
        collector.recordBlock({
          blockId,
          pageStart,
          pageEnd,
          originLines: (block.originLines || []).map((ol: any) => ({
            pageNumber: ol.pageNumber ?? 1,
            physicalLine: ol.physicalLine ?? 1,
          })),
          openedBy: block.hasExplicitDate ? "EXPLICIT_DATE" : "CONTINUATION_RULE",
          closedBy: "NEXT_BLOCK_OR_EOF",
          appendedBy: [],
          descriptionLineCount: block.originLines.length,
          crossedPageBoundary: pageStart !== pageEnd,
          ambiguous: block.isAmbiguous || false,
          ambiguityReasons: block.ambiguityReasons || [],
          valueConflict: false,
          documentConflict: false,
          possibleMegaBlock: (block.ambiguityReasons || []).includes("POSSIBLE_MEGA_BLOCK"),
        });
        blockCounter++;
      }
    }

    const resolvedBlocks = applyTemporalContextToBlocks({
      blocks: assembled.blocks || [],
      dateIdx,
      valueIdxs,
      descIdx,
      parseDate,
      isCoordinateBased: false,
      filteredRows: filtered_rows,
      meta
    });

    if (collector) {
      for (const block of resolvedBlocks) {
        if (block.dateAssignment === "DATE_GROUP_MARKER") continue;
        collector.recordTemporal({
          blockId: block.blockId || "",
          assignment: block.dateAssignment as any,
          normalizedDate: block.dateNormalized || null,
          reasonCode: block.dateReasonCode || "",
          sourceBlockId: block.dateSourceBlockId || null,
          sourcePageNumber: block.dateSourcePage || null,
          sourcePhysicalLine: block.dateSourcePhysicalLine || null,
          inheritedAcrossPage: block.dateReasonCode === "INHERITED_CROSS_PAGE",
          contextInvalidated: false,
          conflictReasons: [],
        });
      }
    }

    const rows: RawRow[] = resolvedBlocks
      .filter((b) => b.dateAssignment !== "DATE_GROUP_MARKER")
      .map((b) => {
        const obj: RawRow = {};
        headers.forEach((h, i) => { obj[h] = String(b.row[i] ?? "").trim(); });
        obj._dateRaw = b.dateRaw || "";
        obj._dateNormalized = b.dateNormalized || "";
        obj._dateDetected = String(b.dateDetected);
        obj._dateInherited = String(b.dateInherited);
        obj._dateAssignment = b.dateAssignment;
        obj._dateSourcePage = b.dateSourcePage != null ? String(b.dateSourcePage) : "";
        obj._dateSourcePhysicalLine = b.dateSourcePhysicalLine != null ? String(b.dateSourcePhysicalLine) : "";
        obj._dateSourceBlockId = b.dateSourceBlockId || "";
        obj._dateReasonCode = b.dateReasonCode;
        obj._blockId = b.blockId || "";
        obj._pageStart = b.pageStart != null ? String(b.pageStart) : "";
        obj._pageEnd = b.pageEnd != null ? String(b.pageEnd) : "";
        obj._isAmbiguous = String(b.isAmbiguous || false);
        obj._ambiguityReasons = (b.ambiguityReasons || []).join(",");
        obj._originLines = JSON.stringify(b.originLines || []);
        obj._hasExplicitDate = String(b.hasExplicitDate || false);
        obj._hasExplicitValue = String(b.hasExplicitValue || false);
        return obj;
      });

    const extractSummary = captureExtractSummary(summaryRows);
    (meta as any).blocks_closed = assembled.blocksClosed;
    (meta as any).lines_appended = assembled.linesAppended;
    (meta as any).dates_inherited = assembled.datesInherited;

    return { headers, rows, meta, charset, extractSummary };
  }

  // PDF Nativo (Alinhamento por Página - Fase 2)
  const pagesMap = new Map<number, PdfPhysicalLine[]>();
  for (const row of matrix) {
    const firstCell = row[0];
    if (firstCell && typeof firstCell !== "string") {
      const pNum = firstCell.pageNumber ?? 1;
      const pWidth = firstCell.pageWidth ?? 595.276;
      if (!pagesMap.has(pNum)) {
        pagesMap.set(pNum, []);
      }
      pagesMap.get(pNum)!.push({
        pageNumber: pNum,
        physicalLine: firstCell.physicalLine ?? 1,
        y: firstCell.y ?? 0,
        pageWidth: pWidth,
        cells: row as PdfPhysicalCell[]
      });
    }
  }

  const pageNumbers = Array.from(pagesMap.keys()).sort((a, b) => a - b);
  let primaryLayout: PageColumnLayout | null = null;
  const detectedPageLayouts = new Map<number, PageColumnLayout>();
  const headerIndicesPerPage = new Map<number, number>();

  // 1ª passada: Detectar cabeçalhos tabulares em cada página
  for (const pNum of pageNumbers) {
    const pLines = pagesMap.get(pNum)!;
    const stringMatrixOfPage = pLines.map(line => line.cells.map(c => c.text));
    const detection = detectHeader(stringMatrixOfPage, meta?.source as string);
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
        reasons: ["Cabeçalho detectado na própria página."]
      };
      detectedPageLayouts.set(pNum, pageLayout);
      headerIndicesPerPage.set(pNum, detection.headerIndex);
      if (!primaryLayout) {
        primaryLayout = pageLayout;
      }
    }
  }

  // Gather first native page text for bank inference
  let firstPageText = "";
  if (pageNumbers.length > 0) {
    const firstPLines = pagesMap.get(pageNumbers[0]);
    if (firstPLines) {
      firstPageText = firstPLines.map(line => line.cells.map(c => c.text).join(" ")).join("\n");
    }
  }
  const bankInferred = inferIssuerBank("", firstPageText);

  // If no primary header layout was detected at all, attempt to reconstruct layout
  if (!primaryLayout) {
    for (const pNum of pageNumbers) {
      const pLines = pagesMap.get(pNum)!;
      const reconstructed = reconstructLayoutWithoutHeader(pLines, pNum, pLines[0].pageWidth, bankInferred);
      if (reconstructed) {
        detectedPageLayouts.set(pNum, reconstructed);
        primaryLayout = reconstructed;
        break;
      }
    }
  }

  if (!primaryLayout) {
    return { headers: [], rows: [], meta, charset, headerFailed: true };
  }

  // Deduplicar cabeçalhos primários para obter o contrato de colunas global
  const rawHeaders = primaryLayout.headers.map((h: any) => h.originalName);
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h}__${n}`;
  });

  // 2ª passada: Resolver páginas sem cabeçalho e aplicar alinhamentos
  let pages_extracted = pageNumbers.length;
  let pages_with_detected_header = 0;
  let pages_reusing_previous_layout = 0;
  let pages_with_adjusted_layout = 0;
  let pages_with_unresolved_layout = 0;
  let repeated_headers_removed = 0;
  let layout_equivalence_failures = 0;

  for (const pNum of pageNumbers) {
    const pLines = pagesMap.get(pNum)!;
    let pageLayout = detectedPageLayouts.get(pNum);

    if (pageLayout) {
      pages_with_detected_header++;
      if (pNum !== primaryLayout.pageNumber) {
        repeated_headers_removed++;
        const isEquivalent = compareDetectedLayouts(pageLayout, primaryLayout);
        if (!isEquivalent) {
          layout_equivalence_failures++;
          pageLayout.reasons.push("Cabeçalho detectado difere da estrutura principal.");
        }
      }
    } else {
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
        if (resolved.source !== "UNRESOLVED") {
          detectedPageLayouts.set(pNum, resolved);
          pageLayout = resolved;
          pages_reusing_previous_layout++;
          if (resolved.appliedOffset !== 0) {
            pages_with_adjusted_layout++;
          }
        } else {
          const reconstructed = reconstructLayoutWithoutHeader(pLines, pNum, pLines[0].pageWidth, bankInferred);
          if (reconstructed) {
            detectedPageLayouts.set(pNum, reconstructed);
            pageLayout = reconstructed;
            pages_reusing_previous_layout++;
          } else {
            detectedPageLayouts.set(pNum, resolved);
            pageLayout = resolved;
            pages_with_unresolved_layout++;
          }
        }
      } else {
        const reconstructed = reconstructLayoutWithoutHeader(pLines, pNum, pLines[0].pageWidth, bankInferred);
        if (reconstructed) {
          detectedPageLayouts.set(pNum, reconstructed);
          pageLayout = reconstructed;
          pages_reusing_previous_layout++;
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
          pageLayout = unresolved;
          pages_with_unresolved_layout++;
        }
      }
    }
  }

  if (collector) {
    for (const pNum of pageNumbers) {
      const layout = detectedPageLayouts.get(pNum);
      if (layout) {
        collector.recordPageLayout({
          pageNumber: pNum,
          layoutSource: layout.source,
          layoutConfidence: layout.confidence,
          equivalentToPage: layout.equivalentToPage,
          detectedColumnCount: layout.headers?.length ?? 0,
          reasons: layout.reasons || [],
        });
      }
    }
  }

  const alignedBodyMatrix: string[][] = [];
  const summaryRows: string[][] = [];
  const alignedLineMetadata: Array<{ pageNumber: number, physicalLine: number, pageLayoutResolved?: boolean }> = [];

  let rows_before_phase3 = 0;
  let rows_after_phase3 = 0;
  let rows_removed_by_phase3 = 0;

  let empty_lines_discarded = 0;
  let metadata_lines_discarded = 0;
  let repeated_headers_discarded = 0;
  let footer_lines_discarded = 0;
  let institutional_lines_discarded = 0;
  let balance_lines_captured = 0;
  let summary_lines_captured = 0;
  let total_lines_captured = 0;
  let ambiguous_rows_forwarded_or_reviewed = 0;
  let transaction_candidate_rows_forwarded = 0;

  const filtered_rows: any[] = [];

  for (const pNum of pageNumbers) {
    const pLines = pagesMap.get(pNum)!;
    const pageLayout = detectedPageLayouts.get(pNum)!;
    const headerIdx = headerIndicesPerPage.get(pNum) ?? -1;

    for (let i = 0; i < pLines.length; i++) {
      const line = pLines[i];
      rows_before_phase3++;
      
      // Remove apenas o cabeçalho tabular repetido confirmado
      if (pageLayout.source === "DETECTED_HEADER" && i === headerIdx) {
        repeated_headers_discarded++;
        rows_removed_by_phase3++;
        if (collector) {
          collector.recordPhase3Row({
            pageNumber: line.pageNumber,
            physicalLine: line.physicalLine,
            category: "REPEATED_HEADER",
            action: "DISCARD_BEFORE_BLOCKS",
            reasonCode: "REPEATED_HEADER_LINE",
            confidence: "HIGH",
            matchedSignals: ["REPEATED_HEADER"],
            textPreview: line.cells.map(c => c.text).join(" | ")
          });
        }
        continue;
      }

      const cellTexts = line.cells.map(c => c.text);
      const context: RowClassificationContext = {
        source: meta?.source as string || "pdf",
        pageNumber: line.pageNumber,
        physicalLine: line.physicalLine,
        isFirstUsefulLineOfPage: i === 0 || (i === 1 && headerIdx === 0),
        isLastUsefulLineOfPage: i === pLines.length - 1,
        knownHeaders: headers
      };
      
      const classification = classifyNonTransactionalRow(cellTexts, context);

      if (collector) {
        collector.recordPhase3Row({
          pageNumber: line.pageNumber,
          physicalLine: line.physicalLine,
          category: classification.category,
          action: classification.action,
          reasonCode: classification.reasonCode,
          confidence: classification.confidence,
          matchedSignals: classification.matchedSignals,
          textPreview: cellTexts.join(" | ")
        });
      }

      if (classification.category === "EMPTY") empty_lines_discarded++;
      else if (classification.category === "METADATA") metadata_lines_discarded++;
      else if (classification.category === "REPEATED_HEADER") repeated_headers_discarded++;
      else if (classification.category === "FOOTER") footer_lines_discarded++;
      else if (classification.category === "INSTITUTIONAL") institutional_lines_discarded++;
      else if (classification.category === "BALANCE") balance_lines_captured++;
      else if (classification.category === "SUMMARY") summary_lines_captured++;
      else if (classification.category === "TOTAL") total_lines_captured++;
      else if (classification.category === "AMBIGUOUS") ambiguous_rows_forwarded_or_reviewed++;
      else if (classification.category === "TRANSACTION_CANDIDATE") transaction_candidate_rows_forwarded++;

      if (classification.preserveForAudit) {
        filtered_rows.push({
          pageNumber: line.pageNumber,
          physicalLine: line.physicalLine,
          category: classification.category,
          action: classification.action,
          reasonCode: classification.reasonCode,
          reasons: classification.reasons,
          originalText: cellTexts.join(" | ")
        });
      }

      switch (classification.action) {
        case "DISCARD_BEFORE_BLOCKS":
          rows_removed_by_phase3++;
          break;
        case "CAPTURE_AS_BALANCE":
        case "CAPTURE_AS_SUMMARY":
        case "CAPTURE_AS_TOTAL":
          summaryRows.push(cellTexts);
          rows_removed_by_phase3++;
          break;
        case "FORWARD_TO_BLOCK_ASSEMBLER":
        case "KEEP_FOR_REVIEW":
          const alignedRow = alignPhysicalCells(line, pageLayout);
          alignedBodyMatrix.push(alignedRow);
          alignedLineMetadata.push({
            pageNumber: line.pageNumber,
            physicalLine: line.physicalLine,
            pageLayoutResolved: pageLayout.source !== "UNRESOLVED"
          });
          rows_after_phase3++;
          break;
      }
    }
  }

  meta.rows_before_phase3 = rows_before_phase3;
  meta.rows_after_phase3 = rows_after_phase3;
  meta.rows_removed_by_phase3 = rows_removed_by_phase3;
  meta.empty_lines_discarded = empty_lines_discarded;
  meta.metadata_lines_discarded = metadata_lines_discarded;
  meta.repeated_headers_discarded = repeated_headers_discarded;
  meta.footer_lines_discarded = footer_lines_discarded;
  meta.institutional_lines_discarded = institutional_lines_discarded;
  meta.balance_lines_captured = balance_lines_captured;
  meta.summary_lines_captured = summary_lines_captured;
  meta.total_lines_captured = total_lines_captured;
  meta.ambiguous_rows_forwarded_or_reviewed = ambiguous_rows_forwarded_or_reviewed;
  meta.transaction_candidate_rows_forwarded = transaction_candidate_rows_forwarded;
  meta.filtered_rows = filtered_rows;

  const dateIdx = headers.findIndex((h) => matchCell(h)?.field === "transaction_date");
  const valueIdxs = headers.map((h, i) => {
    const field = matchCell(h)?.field;
    if (field === "amount" || field === "debit_amount" || field === "credit_amount") return i;
    return -1;
  }).filter((i) => i >= 0);
  const descIdx = headers.findIndex((h) => matchCell(h)?.field === "description");

  const assembled = assembleBlocks({
    bodyMatrix: alignedBodyMatrix,
    dateIdx,
    valueIdxs,
    descIdx,
    parseDate,
    lineMetadata: alignedLineMetadata
  });

  if (collector) {
    let blockCounter = 1;
    for (const block of assembled.blocks || []) {
      const blockId = `${block.pageStart}-${block.originLines[0]?.physicalLine ?? blockCounter}-${blockCounter}`;
      collector.recordBlock({
        blockId,
        pageStart: block.pageStart ?? 1,
        pageEnd: block.pageEnd ?? 1,
        originLines: (block.originLines || []).map((ol: any) => ({
          pageNumber: ol.pageNumber ?? 1,
          physicalLine: ol.physicalLine ?? 1,
        })),
        openedBy: block.hasExplicitDate ? "EXPLICIT_DATE" : "CONTINUATION_RULE",
        closedBy: "NEXT_BLOCK_OR_EOF",
        appendedBy: [],
        descriptionLineCount: block.originLines.length,
        crossedPageBoundary: block.pageStart !== block.pageEnd,
        ambiguous: block.isAmbiguous || false,
        ambiguityReasons: block.ambiguityReasons || [],
        valueConflict: false,
        documentConflict: false,
        possibleMegaBlock: (block.ambiguityReasons || []).includes("POSSIBLE_MEGA_BLOCK"),
      });
      blockCounter++;
    }
  }

  const resolvedBlocks = applyTemporalContextToBlocks({
    blocks: assembled.blocks || [],
    dateIdx,
    valueIdxs,
    descIdx,
    parseDate,
    isCoordinateBased: true,
    filteredRows: filtered_rows,
    meta
  });

  if (collector) {
    for (const block of resolvedBlocks) {
      if (block.dateAssignment === "DATE_GROUP_MARKER") continue;
      collector.recordTemporal({
        blockId: block.blockId || "",
        assignment: block.dateAssignment as any,
        normalizedDate: block.dateNormalized || null,
        reasonCode: block.dateReasonCode || "",
        sourceBlockId: block.dateSourceBlockId || null,
        sourcePageNumber: block.dateSourcePage || null,
        sourcePhysicalLine: block.dateSourcePhysicalLine || null,
        inheritedAcrossPage: block.dateReasonCode === "INHERITED_CROSS_PAGE",
        contextInvalidated: false,
        conflictReasons: [],
      });
    }
  }

  const rows: RawRow[] = resolvedBlocks
    .filter((b) => b.dateAssignment !== "DATE_GROUP_MARKER")
    .map((b) => {
      const obj: RawRow = {};
      headers.forEach((h, i) => { obj[h] = String(b.row[i] ?? "").trim(); });
      obj._dateRaw = b.dateRaw || "";
      obj._dateNormalized = b.dateNormalized || "";
      obj._dateDetected = String(b.dateDetected);
      obj._dateInherited = String(b.dateInherited);
      obj._dateAssignment = b.dateAssignment;
      obj._dateSourcePage = b.dateSourcePage != null ? String(b.dateSourcePage) : "";
      obj._dateSourcePhysicalLine = b.dateSourcePhysicalLine != null ? String(b.dateSourcePhysicalLine) : "";
      obj._dateSourceBlockId = b.dateSourceBlockId || "";
      obj._dateReasonCode = b.dateReasonCode;
      obj._blockId = b.blockId || "";
      obj._pageStart = b.pageStart != null ? String(b.pageStart) : "";
      obj._pageEnd = b.pageEnd != null ? String(b.pageEnd) : "";
      obj._isAmbiguous = String(b.isAmbiguous || false);
      obj._ambiguityReasons = (b.ambiguityReasons || []).join(",");
      obj._originLines = JSON.stringify(b.originLines || []);
      obj._hasExplicitDate = String(b.hasExplicitDate || false);
      obj._hasExplicitValue = String(b.hasExplicitValue || false);
      return obj;
    });

  const extractSummary = captureExtractSummary(summaryRows);

  const pagesDetails = pageNumbers.map(pNum => {
    const layout = detectedPageLayouts.get(pNum);
    return {
      pageNumber: pNum,
      layoutSource: layout?.source,
      layoutConfidence: layout?.confidence,
      equivalentToPage: layout?.equivalentToPage,
      detectedColumnCount: layout?.headers.length,
      appliedOffset: layout?.appliedOffset,
      offsetResidual: layout?.offsetResidual,
      compatibleRowRatio: layout?.compatibleRowRatio,
      reasons: layout?.reasons
    };
  });

  (meta as any).pages_extracted = pages_extracted;
  (meta as any).pages_with_detected_header = pages_with_detected_header;
  (meta as any).pages_reusing_previous_layout = pages_reusing_previous_layout;
  (meta as any).pages_with_adjusted_layout = pages_with_adjusted_layout;
  (meta as any).pages_with_unresolved_layout = pages_with_unresolved_layout;
  (meta as any).repeated_headers_removed = repeated_headers_removed;
  (meta as any).layout_equivalence_failures = layout_equivalence_failures;
  (meta as any).pages_details = pagesDetails;

  (meta as any).blocks_closed = assembled.blocksClosed;
  (meta as any).lines_appended = assembled.linesAppended;
  (meta as any).dates_inherited = assembled.datesInherited;

  return { headers, rows, meta, charset, extractSummary };
}

function mostCommon(arr: number[]): number {
  const m = new Map<number, number>();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  let best = 0, count = 0;
  for (const [k, c] of m) if (c > count) { best = k; count = c; }
  return best;
}

// matchesAnyHeader, HEADER_HINTS e mapHeaders originais foram removidos e encapsulados no módulo headers/

// Campos obrigatórios para prosseguir ao Modelo Canônico (Cap. 9 + Item 7)
const REQUIRED_FIELDS: (keyof CanonicalRow)[] = ["transaction_date", "description"];
function hasAnyAmountMapping(map: FieldMap): boolean {
  return !!(map.amount || map.debit_amount || map.credit_amount);
}
function missingRequiredFields(map: FieldMap): string[] {
  const missing: string[] = REQUIRED_FIELDS.filter((f) => !map[f]);
  if (!hasAnyAmountMapping(map)) missing.push("amount|debit_amount|credit_amount");
  return missing;
}
// Camada 4 — Modelo Canônico + Snapshot bruto
// ============================================================

export function buildCanonical(
  raw: RawRow,
  map: FieldMap,
  extraConcat?: { field: string; cols: [string, string] },
  issuerBank?: IssuerBank | null,
): { canonical: CanonicalRow; snapshot: Record<string, string>; errors: string[] } {
  const snapshot: Record<string, string> = { ...raw };
  const errors: string[] = [];
  const get = (f: keyof CanonicalRow) => (map[f] ? raw[map[f]!] ?? "" : "");

  // Description especial: concatena Histórico + Complemento com " - "
  let description = nullableTrim(get("description"));
  if (extraConcat && extraConcat.field === "description") {
    const [a, b] = extraConcat.cols;
    const va = String(raw[a] ?? "").trim();
    const vb = String(raw[b] ?? "").trim();
    if (va && vb) description = `${va} - ${vb}`;
    else description = nullableTrim(va || vb);
  }

  // Limpa prefixos de data redundantes no início da descrição (ex: "02/07 PIX RECEBIDO" -> "PIX RECEBIDO")
  if (description) {
    const cleaned = description
      .replace(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*/, "")
      .replace(/^(\d{1,2})[\/\-.](\d{1,2})\b\s*/, "")
      .replace(/^(\d{4})[\-.](\d{1,2})[\-.](\d{1,2})\s*/, "")
      .trim();
    if (cleaned.length > 0) {
      description = cleaned;
    }
  }

  const amountRaw = get("amount");
  const debitRaw = get("debit_amount");
  const creditRaw = get("credit_amount");

  const debit = parseBrNumber(debitRaw);
  const credit = parseBrNumber(creditRaw);
  let amount = parseBrNumberStrict(amountRaw, errors, "amount");

  // Derivação de amount: se debit ou credit preenchidos, prevalecem
  if (credit != null && credit !== 0) {
    if (debit != null && debit !== 0) errors.push("Débito e Crédito ambos preenchidos — Crédito prevaleceu (WARNING)");
    amount = Math.abs(credit);
  } else if (debit != null && debit !== 0) {
    amount = -Math.abs(debit);
  }

  const dateStr = get("transaction_date");
  let transaction_date: string | null = null;
  if (dateStr) {
    transaction_date = parseDate(dateStr);
    if (transaction_date == null) errors.push("Data inválida ou ilegível");
  }

  // Campos obrigatórios: amount e transaction_date
  if (amount == null) errors.push("Valor inválido ou ausente");
  if (transaction_date == null) errors.push("Data ausente");

  const canonical: CanonicalRow = {
    client_name: nullableTrim(get("client_name")),
    description,
    amount,
    transaction_date,
    balance: parseBrNumber(get("balance")),
    document_number: nullableTrim(get("document_number")),
    cpf_cnpj: normalizeDoc(get("cpf_cnpj")),
    phone: nullableTrim(get("phone")),
    debit_amount: debit,
    credit_amount: credit,
    movement_type: nullableTrim(get("movement_type")),
    raw_extra: extractExtra(raw, map, extraConcat),
  };

  const enriched = enrichRow(canonical, issuerBank);
  return { canonical: enriched, snapshot, errors };
}

function nullableTrim(s: string): string | null {
  const v = String(s ?? "").trim();
  return v.length === 0 ? null : v;
}

function normalizeDoc(s: string): string | null {
  const v = String(s ?? "").replace(/\D/g, "");
  return v.length ? v : null;
}

function parseBrNumber(s: string): number | null {
  return parseBrazilianMoney(s).value;
}

function parseBrNumberStrict(s: string, errors: string[], field: string): number | null {
  if (!s || !String(s).trim()) return null;
  const n = parseBrNumber(s);
  if (n == null) errors.push(`Falha ao interpretar ${field}="${s}"`);
  return n;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const t = String(s).trim();
  // ISO com timestamp/timezone → converte para America/Sao_Paulo
  if (/T\d{2}:\d{2}/.test(t)) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      const shifted = new Date(d.getTime() - 3 * 3600_000); // UTC-3 fallback determinístico
      return shifted.toISOString().slice(0, 10);
    }
  }
  // DD/MM/YYYY ou DD/MM/YY
  const br = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (br) {
    const a = parseInt(br[1], 10);
    const b = parseInt(br[2], 10);
    let yy = br[3];
    if (yy.length === 2) yy = (parseInt(yy, 10) > 50 ? "19" : "20") + yy;
    // DD/MM/YYYY se dia > 12
    if (a > 12 && b <= 12) return `${yy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    // MM/DD/YYYY se mês > 12
    if (b > 12 && a <= 12) return `${yy}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    // padrão BR
    if (a <= 31 && b <= 12) return `${yy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }
  
  // DD/MM ou DD-MM ou DD.MM (sem ano) - permite texto subsequente usando limite de palavra (\b)
  const brShort = t.match(/^(\d{1,2})[\/\-.](\d{1,2})\b/);
  if (brShort) {
    const a = parseInt(brShort[1], 10);
    const b = parseInt(brShort[2], 10);
    const currentYear = new Date().getFullYear();
    if (a <= 31 && b <= 12) {
      return `${currentYear}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
  }

  // ISO YYYY-MM-DD
  const iso = t.match(/^(\d{4})[\-.](\d{1,2})[\-.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  // Fallback para meses textuais (Nubank etc.)
  return extractDate(t);
}

function extractExtra(raw: RawRow, map: FieldMap, extraConcat?: { cols: [string, string] }): Record<string, string> {
  const mapped = new Set(Object.values(map).filter(Boolean) as string[]);
  if (extraConcat) extraConcat.cols.forEach((c) => mapped.add(c));
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!mapped.has(k) || k.startsWith("_")) {
      extra[k] = v;
    }
  }
  return extra;
}



// ============================================================
// Camada 5 — Resolução (só metadados)
// ============================================================

// Mapeamento determinístico de padrão (Transaction Pattern Library) → subtipo especial.
// Substitui a antiga função matchSpecialTransaction e o regex isExpenseDescription,
// que duplicavam a lógica já concentrada em aliases.ts / transactionPatternLibrary.
function specialFromPattern(
  pattern: TransactionPatternKey,
  c: CanonicalRow,
): ClassificationResult | null {
  if (!pattern) return null;
  const matrix = PATTERN_TO_MATRIX[pattern as string];
  const ruleApplied = matrix
    ? formatRuleApplied(matrix.rule, `${matrix.operation} (Pattern ${pattern})`)
    : formatRuleApplied("15", `Pattern ${pattern}`);
  if (pattern === "SYSTEM_FEE") {
    return { direction: "EXPENSE", subtype: "DESPESA_EMPRESA", confidence: 100, reasons: ["tarifa bancária automática (+100)"], rule_applied: ruleApplied };
  }
  if (pattern === "SYSTEM_RDB_APPLICATION") {
    return { direction: "EXPENSE", subtype: "DESPESA_EMPRESA", confidence: 100, reasons: ["aplicação financeira automática (+100)"], rule_applied: ruleApplied };
  }
  if (pattern === "SYSTEM_RDB_REDEMPTION" || pattern === "SYSTEM_LOAN_REDEMPTION") {
    return { direction: "INCOME", subtype: "RECEITA", confidence: 100, reasons: ["resgate de investimento automático (+100)"], rule_applied: ruleApplied };
  }
  if (pattern === "SYSTEM_RENDIMENTO") {
    return { direction: "INCOME", subtype: "RECEITA", confidence: 100, reasons: ["juros/rendimento automático (+100)"], rule_applied: ruleApplied };
  }
  if (pattern === "SYSTEM_INTERNAL_TRANSFER") {
    const dir = c.amount != null && c.amount > 0 ? "INCOME" : "EXPENSE";
    return { direction: dir, subtype: dir === "INCOME" ? "RECEITA" : "DESPESA_EMPRESA", confidence: 100, reasons: ["movimentação interna (+100)"], rule_applied: formatRuleApplied("32", "Operação bancária interna") };
  }
  return null;
}


export type ClassificationResult = {
  direction: "INCOME" | "EXPENSE" | null;
  subtype: "RECEITA" | "APORTE" | "DESPESA_EMPRESA" | "DESPESA_PESSOAL" | null;
  confidence: number;
  reasons: string[];
  // NTIEB Cap. 62 — regra citada por linha para auditoria
  rule_applied?: string;
};

export function classify(c: CanonicalRow): ClassificationResult {
  const reasons: string[] = [];
  let confidence = 0;
  let direction: "INCOME" | "EXPENSE" | null = null;
  const desc = c.description ?? "";

  // 1. Decidir direção de forma determinística por prioridades
  const norm = normalizeDescription(c.description);
  const pat = detectTransactionPattern(norm);
  const detectedDir = detectDirection(c, pat);
  if (detectedDir) {
    direction = detectedDir;
    confidence = 100;
    reasons.push(`direção definida de forma determinística: ${detectedDir}`);
  }

  // Regra especial de transação bancária / investimento / tarifa (derivada do padrão determinístico)
  const special = specialFromPattern(pat, c);
  if (special) return special;

  // Se não foi definido deterministicamente, cai no cálculo clássico por score/probabilístico
  if (!direction) {
    let expenseScore = 0;
    let incomeScore = 0;

    // 1. Direção estrutural de colunas
    if (c.credit_amount != null && c.credit_amount !== 0 && (c.debit_amount == null || c.debit_amount === 0)) {
      incomeScore += 40;
      reasons.push("coluna Crédito preenchida (+40)");
    } else if (c.debit_amount != null && c.debit_amount !== 0 && (c.credit_amount == null || c.credit_amount === 0)) {
      expenseScore += 40;
      reasons.push("coluna Débito preenchida (+40)");
    }

    // 2. Direção estrutural por sinal básico do valor
    if (c.amount != null) {
      if (c.amount > 0) {
        incomeScore += 20;
        reasons.push("valor positivo (+20)");
      } else if (c.amount < 0) {
        expenseScore += 20;
        reasons.push("valor negativo (+20)");
      }
    }

    // 3. Indicador D/C na coluna de Tipo
    const mt = (c.movement_type ?? "").trim().toUpperCase();
    if (["C", "CR", "CREDITO", "CRÉDITO"].includes(mt)) {
      incomeScore += 10;
      reasons.push("indicador D/C = C (+10)");
    } else if (["D", "DB", "DEB", "DEBITO", "DÉBITO"].includes(mt)) {
      expenseScore += 10;
      reasons.push("indicador D/C = D (+10)");
    }

    // 4. Sinal negativo/positivo ou sufixo D/C no campo de valor
    if (c.amount != null) {
      if (c.amount < 0) {
        expenseScore += 30;
        reasons.push("sufixo D ou sinal negativo no valor (despesa) (+30)");
      } else if (c.amount > 0) {
        incomeScore += 30;
        reasons.push("sufixo C ou sinal positivo no valor (receita) (+30)");
      }
    }

    // Determinação da direção com base no somatório
    if (expenseScore > incomeScore) {
      direction = "EXPENSE";
      confidence = expenseScore;
    } else if (incomeScore > expenseScore) {
      direction = "INCOME";
      confidence = incomeScore;
    }
  }

  // Keyword forte (Subtype determination) — centralizada em SUBTYPE_KEYWORDS/aliases.
  let subtype: ClassificationResult["subtype"] = null;
  if (direction === "INCOME") {
    if (SUBTYPE_KEYWORDS.APORTE.test(desc)) { subtype = "APORTE"; confidence += 30; reasons.push("keyword aporte (+30)"); }
    else if (SUBTYPE_KEYWORDS.STRONG_INCOME.test(desc)) { subtype = "RECEITA"; confidence += 30; reasons.push("keyword receita forte (+30)"); }
    else { subtype = "RECEITA"; }
  } else if (direction === "EXPENSE") {
    if (SUBTYPE_KEYWORDS.PESSOAL.test(desc)) { subtype = "DESPESA_PESSOAL"; confidence += 30; reasons.push("keyword pessoal (+30)"); }
    else if (SUBTYPE_KEYWORDS.STRONG_EXPENSE.test(desc)) { subtype = "DESPESA_EMPRESA"; confidence += 30; reasons.push("keyword despesa empresa (+30)"); }
    else { subtype = "DESPESA_EMPRESA"; }
  }

  // NTIEB Cap. 33/34 — cita a regra oficial aplicada quando há pattern identificado
  const matrix = pat ? PATTERN_TO_MATRIX[pat as string] : undefined;
  const rule_applied = matrix
    ? formatRuleApplied(matrix.rule, `${matrix.operation} (Pattern ${pat})`)
    : direction
      ? formatRuleApplied("33", `Direção ${direction} por sinal/coluna`)
      : formatRuleApplied("33", "Classificação indeterminada");

  return { direction, subtype, confidence: Math.min(100, confidence), reasons, rule_applied };
}


export async function resolveRow(
  sb: SB,
  companyId: string,
  canonical: CanonicalRow,
  issuerBank?: IssuerBank | null,
): Promise<{
  suggestions: Record<string, unknown>;
  reasons: string[];
  resolved_client_id: string | null;
  resolved_service_id: string | null;
  classification: ClassificationResult;
  needsReview: boolean;
}> {
  const reasons: string[] = [];
  const suggestions: Record<string, unknown> = {};
  let resolved_client_id: string | null = null;
  let resolved_service_id: string | null = null;
  let needsReview = false;

  // Classificação
  const classification = classify(canonical);
  if (classification.subtype) {
    suggestions.type = classification.direction === "INCOME" ? "INCOME" : "EXPENSE";
    suggestions.subtype = classification.subtype;
    reasons.push(`classificação: ${classification.subtype} (conf ${classification.confidence}) — ${classification.reasons.join(", ")}`);
  } else {
    reasons.push("classificação indeterminada");
  }
  if (classification.confidence < 60) needsReview = true;

  // Cliente da descrição se não veio
  let clientName = canonical.client_name;
  if (!clientName) {
    const norm = normalizeDescription(canonical.description);
    const pat = detectTransactionPattern(norm);
    clientName = extractClient(canonical.description, pat);
    if (clientName) {
      canonical.client_name = clientName;
      suggestions.client_from_description = clientName;
      reasons.push(`nome extraído da descrição via regex: ${clientName}`);
    }
  }

  // Fallback do nome do cliente quando não foi identificado na linha nem na descrição
  if (!clientName) {
    const desc = canonical.description ?? "";
    const normDesc = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const bankOpKeywords = /\b(tarifa|encargo|iof|juros|saldo|aplicacao|resgate|bco|age|cta)\b/;
    const isBankOperation = bankOpKeywords.test(normDesc);

    if (isBankOperation && issuerBank) {
      const humanBank = getHumanBankName(issuerBank);
      clientName = humanBank;
      canonical.client_name = humanBank;
      reasons.push(`cliente atribuído à razão social do banco emissor: ${humanBank}`);
    } else if (desc.trim()) {
      // Usa a descrição higienizada como nome de cliente
      const cleaned = desc.replace(/\s+/g, " ").trim();
      clientName = cleaned;
      canonical.client_name = cleaned;
      reasons.push(`cliente atribuído a partir da descrição higienizada`);
    } else if (issuerBank) {
      const humanBank = getHumanBankName(issuerBank);
      clientName = humanBank;
      canonical.client_name = humanBank;
      reasons.push(`cliente atribuído ao banco emissor: ${humanBank}`);
    }
  }

  // Resolução: CPF → telefone → documento → nome
  if (canonical.cpf_cnpj || canonical.phone || clientName) {
    const { data: clients } = await sb
      .from("clients")
      .select("id,name,phone,phone_api")
      .eq("company_id", companyId)
      .limit(1000);
    const candidates = clients ?? [];

    if (!resolved_client_id && canonical.phone) {
      const norm = canonical.phone.replace(/\D/g, "");
      const found = candidates.find((c) => (c.phone_api ?? "").includes(norm.slice(-8)));
      if (found) { resolved_client_id = found.id; suggestions.client = { id: found.id, name: found.name }; reasons.push(`cliente por telefone: ${found.name}`); }
    }
    if (!resolved_client_id && clientName) {
      const n = clientName.toLowerCase().trim();
      const exact = candidates.find((c) => c.name.toLowerCase().trim() === n);
      if (exact) { resolved_client_id = exact.id; suggestions.client = { id: exact.id, name: exact.name }; reasons.push(`cliente por nome exato: ${exact.name}`); }
    }
    if (!resolved_client_id) { needsReview = true; reasons.push("cliente não localizado"); }
  }

  // Serviço por proximidade de valor (só receita)
  if (classification.direction === "INCOME" && canonical.amount && canonical.amount > 0) {
    const { data: services } = await sb
      .from("services").select("id,name,price").eq("company_id", companyId).eq("active", true).limit(200);
    const target = Math.abs(canonical.amount);
    const match = (services ?? []).find((s) => Math.abs(Number(s.price) - target) <= Math.max(1, target * 0.02));
    if (match) {
      resolved_service_id = match.id;
      suggestions.service = { id: match.id, name: match.name, price: match.price };
      reasons.push(`serviço por proximidade de valor: ${match.name}`);
    }
  }

  return { suggestions, reasons, resolved_client_id, resolved_service_id, classification, needsReview };
}

// ============================================================
// Camada 6 — Assertion Guard
// ============================================================

export function assertionGuard(
  canonical: CanonicalRow,
  snapshot: Record<string, string>,
  map: FieldMap,
): { ok: boolean; restored: string[]; canonical: CanonicalRow } {
  const restored: string[] = [];
  const fixed = { ...canonical };
  for (const f of PROTECTED_FIELDS) {
    const src = map[f];
    if (!src) continue;
    const original = snapshot[src];
    if (original == null || String(original).trim().length === 0) continue;
    // Se canonical está null mas snapshot tinha valor → tenta restaurar como string
    if ((fixed as any)[f] == null) {
      if (f === "client_name" || f === "description" || f === "document_number" || f === "phone") {
        (fixed as any)[f] = String(original).trim();
        restored.push(f);
      }
    }
  }
  return { ok: restored.length === 0, restored, canonical: fixed };
}

// ============================================================
// Deduplicação objetiva (Cap. 15)
// ============================================================

function normalizeName(s: string | null): string {
  if (!s) return "";
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export async function checkDuplicate(
  sb: SB,
  companyId: string,
  canonical: CanonicalRow,
  siblings: Array<{ id?: string; canonical: CanonicalRow }>,
): Promise<{ duplicate: boolean; conflicts: string[] }> {
  if (canonical.amount == null || !canonical.transaction_date) return { duplicate: false, conflicts: [] };
  const target = canonical.transaction_date;
  const nm = normalizeName(canonical.client_name);
  const conflicts: string[] = [];
  let siblingConflict = false;

  // Dentro da importação
  for (const s of siblings) {
    if (s.canonical === canonical) continue;
    if (s.canonical.amount == null) continue;
    if (Math.abs(s.canonical.amount - canonical.amount) > 0.01) continue;
    const sn = normalizeName(s.canonical.client_name);
    if (nm !== sn) continue;
    if (Math.abs(daysBetween(s.canonical.transaction_date!, target)) > 1) continue;
    if (s.id) conflicts.push(s.id);
    else siblingConflict = true;
  }

  // Últimos 30 dias no banco
  const from = new Date(new Date(target).getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = new Date(new Date(target).getTime() + 1 * 86400_000).toISOString().slice(0, 10);
  const { data } = await sb.from("v3_financial_transactions")
    .select("id,amount,transaction_date,description")
    .eq("company_id", companyId)
    .gte("transaction_date", from)
    .lte("transaction_date", to);
  for (const r of data ?? []) {
    if (Math.abs(Number(r.amount) - canonical.amount) > 0.01) continue;
    if (Math.abs(daysBetween(r.transaction_date, target)) > 1) continue;
    conflicts.push(r.id);
  }
  return { duplicate: conflicts.length > 0 || siblingConflict, conflicts };
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400_000);
}

// ============================================================
// Máquina de Estados (Cap. 37 + Item 3)
// ============================================================

export type TerminalReason =
  | "SCHEMA_MISMATCH"
  | "HEADER_FAILED"
  | "MAP_FAILED"
  | "OCR_TIMEOUT"
  | "OCR_REVIEW"
  | null;

export function computeFinalState(stats: {
  terminal?: TerminalReason;
  headerFailed?: boolean;
  ocrConfidence?: number;
  total: number;
  failed: number;
  review: number;
}): FinalState {
  // Precedência determinística (Item 3)
  if (stats.terminal === "SCHEMA_MISMATCH") return "FAILED";
  if (stats.terminal === "HEADER_FAILED" || stats.headerFailed) return "FAILED";
  if (stats.terminal === "MAP_FAILED") return "FAILED";
  if (stats.terminal === "OCR_TIMEOUT") return "REVIEW";
  if (stats.terminal === "OCR_REVIEW") return "REVIEW";
  if (stats.ocrConfidence != null && stats.ocrConfidence < 0.8 && stats.ocrConfidence > 0) return "REVIEW";
  if (stats.total > 0 && stats.failed / stats.total >= 0.1) return "FAILED";
  if (stats.review > 0) return "REVIEW";
  if (stats.failed > 0) return "PARTIAL_SUCCESS";
  return "SUCCESS";
}

// ============================================================
// Orquestrador
// ============================================================

async function auditLog(sb: SB, args: {
  importId: string; companyId: string; rowId?: string; stage: string; event: string;
  input?: any; output?: any; reason: string; responsavel?: string;
}) {
  await sb.from("v3_audit_log").insert({
    import_id: args.importId,
    company_id: args.companyId,
    row_id: args.rowId ?? null,
    stage: args.stage,
    event: args.event,
    input: args.input ?? null,
    output: args.output ?? null,
    reason: args.reason,
    responsavel: args.responsavel ?? "Sistema",
    algorithm_version: V3_ALGORITHM_VERSION,
  } as any);
}

// Item 2 — validação de compatibilidade schema vs pipeline.
// Faz uma sondagem barata: tenta INSERT com status inválido antigo; se aceitar → schema V2.
async function checkSchemaCompatibility(sb: SB): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { error: rowErr } = await sb
      .from("v3_import_rows")
      .select("id, audit_trace")
      .limit(1);
    
    if (rowErr) {
      if (rowErr.message.includes("column") && rowErr.message.includes("audit_trace")) {
        return { 
          ok: false, 
          detail: "A coluna 'audit_trace' não existe em 'v3_import_rows'." 
        };
      }
      return { ok: false, detail: `v3_import_rows check failed: ${rowErr.message}` };
    }

    const { error: impErr } = await sb
      .from("v3_imports")
      .select("id, audit_summary")
      .limit(1);
    
    if (impErr) {
      if (impErr.message.includes("column") && impErr.message.includes("audit_summary")) {
        return { 
          ok: false, 
          detail: "A coluna 'audit_summary' não existe em 'v3_imports'." 
        };
      }
      return { ok: false, detail: `v3_imports check failed: ${impErr.message}` };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, detail: e.message ?? String(e) };
  }
}

function rawTableToCsv(raw: RawTable): string {
  const headerLine = raw.headers.join(";");
  const rowLines = raw.rows.map((row) => 
    raw.headers.map((h) => {
      const val = row[h] ?? "";
      const escaped = String(val).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(";")
  );
  return [headerLine, ...rowLines].join("\n");
}

export async function runPipeline(
  sb: SB,
  args: { importId: string; companyId: string; source: "csv" | "xlsx" | "pdf" | "ofx" | "manual_text"; storagePath: string },
): Promise<{ rowsInserted: number; finalState: FinalState; csvText?: string }> {
  await sb.from("v3_imports").update({ status: "parsing" }).eq("id", args.importId);

  const collector = new ImportAuditCollector(args.importId, args.source);
  collector.setFilename(args.storagePath.split("/").pop() || "extrato.pdf");

  // NTIEB Cap. 65 — Log obrigatório: registra o momento de início para medir processing_ms
  const pipelineStart = Date.now();

  // Estado agregado para o cálculo final via finally (Item 3)
  let csvText: string | undefined;
  let raw: RawTable | undefined;
  let terminal: TerminalReason = null;
  let file_hash: string | undefined;
  let charset: string | undefined;
  let ocrConfidence: number | undefined;
  let total = 0, failed = 0, review = 0;
  let incomeCount = 0, expenseCount = 0;
  let totalIncomeAmount = 0, totalExpenseAmount = 0; // NTIEB Cap. 55
  let veryLowConfCount = 0; // NTIEB Cap. 61
  let extractSummary: ExtractSummary | undefined;
  let rowsInserted = 0;
  let lastError: string | null = null;
  let finalState: FinalState = "SUCCESS";

  try {
    // Item 2 — schema compatibility
    const schema = await checkSchemaCompatibility(sb);
    if (!schema.ok) {
      terminal = "SCHEMA_MISMATCH";
      lastError = `Schema incompatível: ${schema.detail ?? "verifique migrações V3"}`;
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "orchestrator", event: "SCHEMA_MISMATCH",
        reason: lastError,
      });
      collector.setStatus("FAILED");
      collector.addError(lastError);
      throw new Error(lastError);
    }

    // 1) Download + hash
    const startDownload = Date.now();
    const dl = await sb.storage.from("imports").download(args.storagePath);
    if (dl.error || !dl.data) {
      const downloadTime = Date.now() - startDownload;
      console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: downloadStorage\nRows: 0\nTime: ${downloadTime} ms\nStatus: ERROR\nError: ${dl.error?.message ?? "Dados vazios"}`);
      collector.setStatus("FAILED");
      collector.addError(dl.error?.message ?? "Download dos dados do arquivo retornou vazio");
      throw new Error(`Falha no download: ${dl.error?.message}`);
    }
    const arrayBuffer = await dl.data.arrayBuffer();
    const rawBuf = new Uint8Array(arrayBuffer);
    const buf = new Uint8Array(rawBuf.length);
    buf.set(rawBuf);
    file_hash = await sha256Hex(buf);
    const downloadTime = Date.now() - startDownload;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: downloadStorage\nRows: 0\nTime: ${downloadTime} ms\nStatus: OK`);

    // 2) Conversão
    const startParse = Date.now();
    collector.startPhase("PHASE_2");

    let isImagePdf = false;
    let nativePages: number[] = [];
    let imagePages: number[] = [];

    if (args.source === "csv") {
      raw = parseCsv(buf, collector);
      charset = raw.charset ?? "utf-8";
      
      if (raw.headerFailed || raw.headers.length === 0) {
        terminal = "HEADER_FAILED";
        lastError = "Cabeçalho não identificado (nenhuma linha com ≥2 cabeçalhos conhecidos)";
        await auditLog(sb, {
          importId: args.importId, companyId: args.companyId,
          stage: "conversion", event: "HEADER_FAILED",
          input: { headers_seen: raw.headers, sample: raw.rows.slice(0, 3) } as any,
          reason: lastError,
        });
        return { rowsInserted: 0, finalState: "FAILED", csvText };
      }
    } else if (args.source === "xlsx") {
      raw = parseXlsx(buf, collector);
      charset = raw.charset ?? "utf-8";

      if (raw.headerFailed || raw.headers.length === 0) {
        terminal = "HEADER_FAILED";
        lastError = "Cabeçalho não identificado (nenhuma linha com ≥2 cabeçalhos conhecidos)";
        await auditLog(sb, {
          importId: args.importId, companyId: args.companyId,
          stage: "conversion", event: "HEADER_FAILED",
          input: { headers_seen: raw.headers, sample: raw.rows.slice(0, 3) } as any,
          reason: lastError,
        });
        return { rowsInserted: 0, finalState: "FAILED", csvText };
      }
    } else if (args.source === "pdf") {
      const unpdf: any = await import("unpdf");
      const pdf = await unpdf.getDocumentProxy(buf);
      
      const pageClassifications: Record<number, "NATIVE" | "IMAGE"> = {};
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageType = classifyPage(content.items ?? []);
        pageClassifications[i] = pageType;
        if (pageType === "NATIVE") {
          nativePages.push(i);
        } else {
          imagePages.push(i);
        }
      }

      const combinedRows: string[][] = [
        ["date", "description", "amount", "debit", "credit", "balance", "doc", "client_name", "cpf_cnpj", "phone", "movement_type", "page", "origin_lines"]
      ];

      let nativeLinesCount = 0;
      let ocrLinesCount = 0;
      let cacheHitsCount = 0;
      let totalOcrTimeMs = 0;

      // Extrator Nativo (Sem IA)
      if (nativePages.length > 0) {
        try {
          const nativeRes = await extractNativePdfToCsv(pdf, {
            fileHash: file_hash!,
            nativePages
          });

          if (collector && nativeRes.detectedPageLayouts) {
            for (const [pNum, layout] of nativeRes.detectedPageLayouts.entries()) {
              collector.recordPageLayout({
                pageNumber: pNum,
                layoutSource: layout.source as any,
                layoutConfidence: layout.confidence,
                equivalentToPage: layout.equivalentToPage,
                detectedColumnCount: layout.headers?.length ?? 0,
                reasons: layout.reasons || [],
              });
            }
          }

          if (collector && nativeRes.doubtfulRows) {
            for (const row of nativeRes.doubtfulRows) {
              collector.recordPhase3Row({
                pageNumber: row.pageNumber,
                physicalLine: row.physicalLine,
                category: "DOUBTFUL_TRANSACTION",
                action: "MARKED_FOR_REVISION",
                reasonCode: "RECONSTRUCTION_DOUBT",
                confidence: "LOW",
                matchedSignals: [row.doubtReason],
                textPreview: row.textPreview
              });
            }
          }

          const parsedNative = Papa.parse<string[]>(nativeRes.csvText, { delimiter: ";", skipEmptyLines: true });
          if (parsedNative.data.length > 1) {
            combinedRows.push(...parsedNative.data.slice(1));
            nativeLinesCount += parsedNative.data.length - 1;
          }
        } catch (nativeErr: any) {
          console.warn("[SIE V3] Extrator Nativo falhou, movendo todas as páginas para o extrator OCR:", nativeErr.message);
          imagePages.push(...nativePages);
          nativePages = [];
        }
      }

      // Extrator Imagem (OCR Determinístico)
      if (imagePages.length > 0) {
        isImagePdf = true;
        for (const pNum of imagePages) {
          const ocrRes = await extractOcrPageToCsv(sb, {
            pdfProxy: pdf,
            pageIndex: pNum,
            fileHash: file_hash!,
            companyId: args.companyId,
            importId: args.importId
          });
          totalOcrTimeMs += ocrRes.ocrTimeMs;
          if (ocrRes.cacheHit) {
            cacheHitsCount++;
          }
          
          const parsedOcr = Papa.parse<string[]>(ocrRes.csvLines, { delimiter: ";", skipEmptyLines: true });
          let startRow = 0;
          if (parsedOcr.data.length > 0) {
            const firstRowSig = parsedOcr.data[0].map(c => String(c).toLowerCase().trim()).join(";");
            if (firstRowSig.includes("date") && firstRowSig.includes("description")) {
              startRow = 1;
            }
          }
          const rowsToAppend = parsedOcr.data.slice(startRow);
          combinedRows.push(...rowsToAppend);
          ocrLinesCount += rowsToAppend.length;
        }
      }

      csvText = Papa.unparse(combinedRows, { delimiter: ";" });
      charset = "utf-8";

      // Auditoria completa (Item 9)
      const csvHash = await sha256Hex(new TextEncoder().encode(csvText));
      await auditLog(sb, {
        importId: args.importId,
        companyId: args.companyId,
        stage: "extração",
        event: "CSV_CANONICO_GERADO",
        reason: `PDF processado. Páginas: ${pdf.numPages} (Nativas: ${nativePages.length}, Imagens: ${imagePages.length}). Total linhas: ${combinedRows.length - 1}. Cache hits OCR: ${cacheHitsCount}.`,
        input: {
          file_hash,
          csv_hash: csvHash,
          pipeline_version: "v3.0.0",
          extractor_version: "v3.0.0",
          native_pages: nativePages,
          image_pages: imagePages,
          native_lines: nativeLinesCount,
          ocr_lines: ocrLinesCount,
          cache_hits: cacheHitsCount,
          ocr_duration_ms: totalOcrTimeMs
        }
      });

      // Validação do CSV Canônico (Item 5)
      const validation = validateCanonicalCsv(csvText);
      if (!validation.valid) {
        terminal = "HEADER_FAILED";
        lastError = "Validação estrutural do CSV canônico falhou: " + validation.errors.map(e => `Linha ${e.line}: ${e.error}`).join(" | ");
        await auditLog(sb, {
          importId: args.importId,
          companyId: args.companyId,
          stage: "validação",
          event: "VALIDATION_FAILED",
          reason: lastError,
        });
        return { rowsInserted: 0, finalState: "FAILED", csvText };
      }

      // Downstream Pipeline unificado pós-CSV
      const meta: Record<string, unknown> = {
        source: isImagePdf ? "pdf_ocr" : "pdf_native",
        pages: pdf.numPages,
        imagePages,
        nativePages
      };
      
      raw = finalizeTable(combinedRows, meta, "utf-8", collector);
      ocrConfidence = isImagePdf ? (cacheHitsCount === imagePages.length ? 1.0 : 0.9) : 1.0;
      extractSummary = raw.extractSummary;
    } else {
      throw new Error(`Fonte não suportada na V3: ${args.source}`);
    }

    collector.endPhase("PHASE_2");

    const parseTime = Date.now() - startParse;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: parse_${args.source}\nRows: ${raw.rows.length}\nTime: ${parseTime} ms\nStatus: OK`);
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: finalizeTable\nRows: ${raw.rows.length}\nTime: 0 ms\nStatus: OK`);

    // 3) Mapeamento
    const startMap = Date.now();
    const { map, reasons: mapReasons, extraConcat } = mapHeaders(raw.headers);
    const mapTime = Date.now() - startMap;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: mapHeaders\nRows: ${raw.rows.length}\nTime: ${mapTime} ms\nStatus: OK`);
    await auditLog(sb, {
      importId: args.importId, companyId: args.companyId,
      stage: "mapper", event: "MAP_HEADERS",
      input: { headers: raw.headers }, output: map as any,
      reason: mapReasons.join(" | ") || "nenhum mapeamento reconhecido",
    });

    // Item 7 — validação de mapeamento obrigatório antes do Modelo Canônico
    const missing = missingRequiredFields(map);
    if (missing.length > 0) {
      terminal = "MAP_FAILED";
      lastError = `Mapeamento incompleto — campos obrigatórios ausentes: ${missing.join(", ")}. Cabeçalhos vistos: ${raw.headers.join(", ")}`;
      console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: mapHeaders\nRows: ${raw.rows.length}\nTime: ${mapTime} ms\nStatus: ERROR\nError: ${lastError}`);
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "mapper", event: "MAP_FAILED",
        input: { headers: raw.headers, map } as any,
        reason: lastError,
      });
      return { rowsInserted: 0, finalState: "FAILED" };
    }

    const filename = args.storagePath.split("/").pop() || "extrato.pdf";
    const sampleText = csvText || raw.headers.join(" ") + " " + raw.rows.slice(0, 5).map(r => Object.values(r).join(" ")).join(" ");
    const issuerBank = inferIssuerBank(filename, sampleText);

    // 4-8) Por linha: canonical → guard → resolução → dedup
    const startCanonical = Date.now();
    const built = raw.rows.map((r) => buildCanonical(r, map, extraConcat, issuerBank));
    const canonicalTime = Date.now() - startCanonical;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: buildCanonical\nRows: ${built.length}\nTime: ${canonicalTime} ms\nStatus: OK`);

    const startResolve = Date.now();
    const rowsToInsert: any[] = [];

    const isZeroOrEmpty = (val: string | null | undefined): boolean => {
      if (val == null) return true;
      const s = String(val).trim();
      if (!s || s === "-" || s === "0" || s === "0,00" || s === "0.00") return true;
      const n = parseBrNumber(s);
      return n === 0;
    };

    let rows_evaluated_phase6 = 0;
    let rows_gate_passed = 0;
    let rows_gate_failed = 0;
    let rows_approved = 0;
    let rows_review_stat = 0;
    let rows_failed_stat = 0;
    let rows_capped_by_structure = 0;
    let rows_capped_by_missing_client = 0;
    let rows_capped_by_inherited_date = 0;
    let rows_capped_by_unresolved_layout = 0;
    let rows_with_direction_conflict = 0;
    let rows_with_value_conflict = 0;
    let rows_with_temporal_conflict = 0;
    let possible_mega_blocks = 0;

    let sum_direction_confidence = 0;
    let sum_structural_confidence = 0;
    let sum_semantic_confidence = 0;
    let sum_overall_confidence = 0;

    for (let i = 0; i < built.length; i++) {
      const { canonical: rawCan, snapshot, errors } = built[i];
      const guard = assertionGuard(rawCan, snapshot, map);
      const canonical = guard.canonical;

      // 1. Filtrar/Desconsiderar operações com valores zerados ou vazios (ex: summaries, headers repetidos, filler lines)
      const amountRaw = map.amount ? snapshot[map.amount] : "";
      const debitRaw = map.debit_amount ? snapshot[map.debit_amount] : "";
      const creditRaw = map.credit_amount ? snapshot[map.credit_amount] : "";

      if (isZeroOrEmpty(amountRaw) && isZeroOrEmpty(debitRaw) && isZeroOrEmpty(creditRaw)) {
        console.log(`[SIE V3] Ignorando linha index ${i} devido a valores zerados/vazios:`, canonical.description);
        continue;
      }

      let status: LineStatus = "OK";
      const rowReasons: string[] = [...errors];
      if (errors.length > 0) status = "LINE_FAILED";

      let resolution: any = null;
      if (status !== "LINE_FAILED") {
        resolution = await resolveRow(sb, args.companyId, canonical, issuerBank);
        rowReasons.push(...resolution.reasons);
      }

      // Fase 6: Gate Estrutural e Decisão de Confiança
      const directionConf = resolution?.classification?.confidence ?? 0;
      const isPdf = args.source === "pdf";
      const quality = evaluateRowQuality(canonical, directionConf, isPdf, issuerBank);

      // Sobrescreve/atualiza status local baseado na Fase 6
      if (quality.finalStatus === "LINE_FAILED") {
        status = "LINE_FAILED";
      } else if (quality.finalStatus === "LINE_REVIEW") {
        if (status === "OK") {
          status = "LINE_REVIEW";
        }
      }
      rowReasons.push(...quality.reasons);

      // Atualiza estatísticas da Fase 6
      rows_evaluated_phase6++;
      if (quality.gate.passed) rows_gate_passed++;
      else rows_gate_failed++;

      if (quality.finalStatus === "LINE_APPROVED") rows_approved++;
      else if (quality.finalStatus === "LINE_REVIEW") rows_review_stat++;
      else if (quality.finalStatus === "LINE_FAILED") rows_failed_stat++;

      if (quality.reasonCodes.includes("CAPPED_BY_STRUCTURE")) rows_capped_by_structure++;
      if (quality.reasonCodes.includes("MISSING_CLIENT")) rows_capped_by_missing_client++;
      if (quality.reasonCodes.includes("INHERITED_DATE") || quality.reasonCodes.includes("CROSS_PAGE_INHERITED_DATE")) rows_capped_by_inherited_date++;
      if (quality.reasonCodes.includes("UNRESOLVED_PAGE_LAYOUT")) rows_capped_by_unresolved_layout++;
      if (quality.reasonCodes.includes("DIRECTION_COLUMN_CONFLICT")) rows_with_direction_conflict++;
      if (quality.reasonCodes.includes("VALUE_CONFLICT")) rows_with_value_conflict++;
      if (quality.reasonCodes.includes("TEMPORAL_CONFLICT")) rows_with_temporal_conflict++;
      if (quality.reasonCodes.includes("POSSIBLE_MEGA_BLOCK")) possible_mega_blocks++;

      sum_direction_confidence += quality.confidence.directionConfidence;
      sum_structural_confidence += quality.confidence.structuralConfidence;
      sum_semantic_confidence += quality.confidence.semanticConfidence;
      sum_overall_confidence += quality.confidence.overallConfidence;

      const dup = status !== "LINE_FAILED"
        ? await checkDuplicate(sb, args.companyId, canonical, built.map((b) => ({ canonical: b.canonical })))
        : { duplicate: false, conflicts: [] };

      if (status === "LINE_FAILED") failed++;
      else if (status === "LINE_REVIEW") review++;

      // NTIEB Cap. 36/61 — nível de confiança oficial derivado do score
      const confScore = quality.confidence.overallConfidence;
      const confidence_level = quality.confidence.overallBand;

      // NTIEB Cap. 61 — regra dura: MUITO_BAIXA sempre vai para revisão manual
      if (confidence_level === "MUITO_BAIXA") {
        veryLowConfCount++;
        if (status === "OK") {
          status = "LINE_REVIEW";
          review++;
          rowReasons.push(formatRuleApplied("61", "Confiança Muito Baixa — revisão obrigatória"));
        }
      }

      // NTIEB Cap. 62 — regra citada por linha
      const rule_applied =
        resolution?.classification?.rule_applied ??
        (status === "LINE_FAILED"
          ? formatRuleApplied("54", "Campos obrigatórios ausentes / erro estrutural")
          : formatRuleApplied("33", "Classificação indeterminada"));

      const processing_metadata = {
        parser: args.source, algorithm_version: V3_ALGORITHM_VERSION,
        charset, file_hash, headers: raw.headers, map, meta: raw.meta,
        restored_fields: guard.restored,
        ntieb_version: NTIEB_VERSION,
        confidence_breakdown: quality.confidence,
      };

      // Fase 7: Adicionar registros de auditoria por linha
      if (collector) {
        collector.recordConfidence({
          blockId: canonical.raw_extra?._blockId || "",
          directionConfidence: quality.confidence.directionConfidence,
          structuralConfidence: quality.confidence.structuralConfidence,
          semanticConfidence: quality.confidence.semanticConfidence,
          overallConfidence: quality.confidence.overallConfidence,
          directionBand: quality.confidence.directionBand,
          structuralBand: quality.confidence.structuralBand,
          semanticBand: quality.confidence.semanticBand,
          overallBand: quality.confidence.overallBand,
          capsApplied: quality.reasonCodes.filter(rc => rc.startsWith("CAPPED_")),
          hardFailures: quality.gate.hardFailures,
          reviewReasons: quality.gate.reviewReasons,
          finalStatus: quality.finalStatus,
        });
      }

      const origin_lines = canonical.raw_extra?._originLines ? JSON.parse(canonical.raw_extra._originLines) : [];
      const block_debug = {
        blockId: canonical.raw_extra?._blockId || "",
        openedBy: "",
        closedBy: "",
        crossedPageBoundary: canonical.raw_extra?._pageStart !== canonical.raw_extra?._pageEnd,
        ambiguous: canonical.raw_extra?._isAmbiguous === "true",
        possibleMegaBlock: (canonical.raw_extra?._ambiguityReasons ?? "").includes("POSSIBLE_MEGA_BLOCK"),
      };
      const audit_trace = {
        version: "1.0",
        source: {
          pageStart: Number(canonical.raw_extra?._pageStart || 1),
          pageEnd: Number(canonical.raw_extra?._pageEnd || 1),
          originLines: origin_lines,
        },
        block: {
          blockId: block_debug.blockId,
          openedBy: "",
          closedBy: "",
        },
        temporal: {
          assignment: canonical.raw_extra?._dateAssignment || "",
          reasonCode: canonical.raw_extra?._dateReasonCode || "",
        },
        confidence: {
          structural: quality.confidence.structuralConfidence,
          semantic: quality.confidence.semanticConfidence,
          direction: quality.confidence.directionConfidence,
          overall: quality.confidence.overallConfidence,
          finalStatus: quality.finalStatus,
        }
      };

      rowsToInsert.push({
        import_id: args.importId,
        company_id: args.companyId,
        row_index: i + 1,
        original_snapshot: snapshot,
        canonical,
        suggestions: resolution?.suggestions ?? {},
        processing_metadata,
        resolved_client_id: resolution?.resolved_client_id ?? null,
        resolved_service_id: resolution?.resolved_service_id ?? null,
        status,
        confidence: confScore,
        classification_confidence: quality.confidence.directionConfidence,
        confidence_level,
        rule_applied,
        possible_duplicate: dup.duplicate,
        duplicate_of: dup.conflicts,
        reason: rowReasons.join(" | ").slice(0, 2000),
        origin_lines,
        block_debug,
        audit_trace,
      });

      if (guard.restored.length > 0) {
        await auditLog(sb, {
          importId: args.importId, companyId: args.companyId,
          stage: "validator", event: "PROTECTED_RESTORE",
          input: snapshot, output: canonical as any,
          reason: `Campos restaurados do snapshot: ${guard.restored.join(", ")}`,
        });
      }
    }

    if (raw.meta) {
      const m = raw.meta as any;
      m.rows_evaluated_phase6 = rows_evaluated_phase6;
      m.rows_gate_passed = rows_gate_passed;
      m.rows_gate_failed = rows_gate_failed;
      m.rows_approved = rows_approved;
      m.rows_review_stat = rows_review_stat;
      m.rows_failed_stat = rows_failed_stat;
      m.rows_capped_by_structure = rows_capped_by_structure;
      m.rows_capped_by_missing_client = rows_capped_by_missing_client;
      m.rows_capped_by_inherited_date = rows_capped_by_inherited_date;
      m.rows_capped_by_unresolved_layout = rows_capped_by_unresolved_layout;
      m.rows_with_direction_conflict = rows_with_direction_conflict;
      m.rows_with_value_conflict = rows_with_value_conflict;
      m.rows_with_temporal_conflict = rows_with_temporal_conflict;
      m.possible_mega_blocks = possible_mega_blocks;
      
      const count = rows_evaluated_phase6 || 1;
      m.average_direction_confidence = sum_direction_confidence / count;
      m.average_structural_confidence = sum_structural_confidence / count;
      m.average_semantic_confidence = sum_semantic_confidence / count;
      m.average_overall_confidence = sum_overall_confidence / count;
    }

    const resolveTime = Date.now() - startResolve;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: resolveRow\nRows: ${rowsToInsert.length}\nTime: ${resolveTime} ms\nStatus: OK`);

    total = rowsToInsert.length;

    // Item 1 — persistência atômica: se qualquer chunk falhar, remove tudo desta importação.
    const startPersist = Date.now();
    try {
      for (let i = 0; i < rowsToInsert.length; i += 200) {
        const chunk = rowsToInsert.slice(i, i + 200);
        const { error } = await sb.from("v3_import_rows").insert(chunk);
        if (error) throw new Error(`Falha ao persistir linhas: ${error.message}`);
      }
      rowsInserted = rowsToInsert.length;
      const persistTime = Date.now() - startPersist;
      console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: persistRows\nRows: ${rowsInserted}\nTime: ${persistTime} ms\nStatus: OK`);
    } catch (persistErr: any) {
      const persistTime = Date.now() - startPersist;
      console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: persistRows\nRows: 0\nTime: ${persistTime} ms\nStatus: ERROR\nError: ${persistErr.message || String(persistErr)}`);
      // Rollback determinístico: apaga qualquer linha desta importação (parcial ou não).
      await sb.from("v3_import_rows").delete().eq("import_id", args.importId);
      lastError = persistErr.message ?? String(persistErr);
      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "persistence", event: "PERSIST_FAILED",
        reason: `${lastError} — rollback aplicado (todas as linhas desta importação removidas).`,
      });
      // Persistência falhou → estado final via finally cuidará; sinaliza FAILED via terminal.
      terminal = "SCHEMA_MISMATCH"; // tratamos como falha estrutural que precede a máquina de estados
      throw persistErr;
    }

  } catch (err: any) {
    lastError = err?.message ?? String(err);
    throw err;
  } finally {
    // Item 3 — computeFinalState é SEMPRE executado.
    const startState = Date.now();
    finalState = computeFinalState({
      terminal,
      ocrConfidence,
      total,
      failed,
      review,
    });
    const stateTime = Date.now() - startState;
    console.log(`\n[PHASE 0 LOG] IMPORT ${args.importId}\nStage: computeFinalState\nRows: ${total}\nTime: ${stateTime} ms\nStatus: ${finalState}`);

    try {
      // NTIEB Cap. 64 — status oficial de homologação derivado do finalState
      let homologation_status = toHomologationStatus(finalState);
      const processing_ms = Date.now() - pipelineStart;

      // NTIEB Cap. 55 — validação de saldo do extrato
      const balance = validateBalance(
        extractSummary ?? { saldoInicial: null, saldoFinal: null, totalEntradas: null, totalSaidas: null },
        { income: totalIncomeAmount, expense: totalExpenseAmount },
      );

      // Divergência de saldo eleva homologação para "APROVADA_COM_ALERTAS"
      if (balance.applicable && balance.valid === false && homologation_status === "APROVADA") {
        homologation_status = "APROVADA_COM_ALERTAS";
      }

      collector.setStatus(
        finalState === "FAILED" ? "FAILED" : finalState === "REVIEW" ? "COMPLETED_WITH_REVIEW" : "COMPLETED"
      );
      if (lastError) collector.addError(lastError);

      const report = collector.finalize(rowsInserted);

      // Imprime o relatório textual no log do servidor
      console.log(generateAuditTextReport(report));

      // 1. Update Essencial
      const essentialPayload: any = {
        status: finalState === "FAILED" ? "failed" : finalState === "REVIEW" ? "review" : "applied",
        final_state: finalState,
        file_hash: file_hash ?? null,
        charset: charset ?? null,
        ocr_confidence: ocrConfidence ?? null,
        total_rows: total,
        failed_rows: failed,
        review_rows: review,
        last_error: lastError,
        finished_at: new Date().toISOString(),
        homologation_status,
        ntieb_version: NTIEB_VERSION,
        parser_version: PARSER_VERSION,
        processing_ms,
        income_count: incomeCount,
        expense_count: expenseCount,
        saldo_inicial: extractSummary?.saldoInicial ?? null,
        saldo_final: extractSummary?.saldoFinal ?? null,
        total_entradas_extrato: extractSummary?.totalEntradas ?? null,
        total_saidas_extrato: extractSummary?.totalSaidas ?? null,
        balance_valid: balance.applicable ? balance.valid : null,
        balance_delta: balance.applicable ? balance.delta : null,
        very_low_confidence_count: veryLowConfCount,
      };

      console.log(`[SIE V3] Salvando estado essencial da importação ${args.importId}...`);
      const { error: essentialErr } = await sb
        .from("v3_imports")
        .update(essentialPayload)
        .eq("id", args.importId);

      if (essentialErr) {
        console.error("[SIE V3] Erro crítico ao salvar estado essencial da importação:", essentialErr.message);
      }

      // 2. Update de Auditoria (opcional/aditivo, tolerante a falhas)
      try {
        console.log(`[SIE V3] Salvando observabilidade e auditoria da importação ${args.importId}...`);
        const auditPayload: any = {
          audit_summary: report,
          audit_version: "1.0",
          physical_lines_extracted: report.summary.physicalLinesExtracted ?? null,
          pages_extracted: report.summary.pagesExtracted ?? null,
          pages_with_detected_header: raw?.meta?.pages_with_detected_header ?? null,
          pages_reusing_previous_layout: raw?.meta?.pages_reusing_previous_layout ?? null,
          pages_with_adjusted_layout: raw?.meta?.pages_with_adjusted_layout ?? null,
          pages_with_unresolved_layout: raw?.meta?.pages_with_unresolved_layout ?? null,
          layout_equivalence_failures: raw?.meta?.layout_equivalence_failures ?? null,
          repeated_headers_removed: raw?.meta?.repeated_headers_removed ?? null,
          administrative_lines_discarded: raw?.meta?.administrative_lines_discarded ?? null,
          institutional_lines_discarded: raw?.meta?.institutional_lines_discarded ?? null,
          metadata_lines_discarded: raw?.meta?.metadata_lines_discarded ?? null,
          footer_lines_discarded: raw?.meta?.footer_lines_discarded ?? null,
          summary_lines_captured: raw?.meta?.summary_lines_captured ?? null,
          balance_lines_captured: raw?.meta?.balance_lines_captured ?? null,
          total_lines_captured: raw?.meta?.total_lines_captured ?? null,
          transaction_candidate_rows: report.summary.transactionCandidates ?? null,
          ambiguous_rows: raw?.meta?.ambiguous_rows_forwarded_or_reviewed ?? null,
          blocks_created: report.summary.blocksCreated ?? null,
          blocks_appended: raw?.meta?.blocks_appended ?? null,
          blocks_crossing_pages: raw?.meta?.blocks_crossing_pages ?? null,
          blocks_marked_ambiguous: raw?.meta?.blocks_marked_ambiguous ?? null,
          possible_mega_blocks: raw?.meta?.possible_mega_blocks ?? null,
          dates_explicit: raw?.meta?.dates_explicit ?? null,
          dates_inherited: raw?.meta?.dates_inherited ?? null,
          dates_missing: raw?.meta?.dates_missing ?? null,
          temporal_conflicts: raw?.meta?.temporal_conflicts ?? null,
          rows_gate_passed: report.phases.phase6.totals.rows_gate_passed ?? null,
          rows_gate_failed: report.phases.phase6.totals.rows_gate_failed ?? null,
          rows_approved: report.summary.rowsApproved ?? null,
          rows_review: report.summary.rowsReview ?? null,
          rows_failed: report.summary.rowsFailed ?? null,
          rows_persisted: rowsInserted,
        };

        const { error: auditErr } = await sb
          .from("v3_imports")
          .update(auditPayload)
          .eq("id", args.importId);

        if (auditErr) {
          console.warn("[SIE V3] Falha técnica ao salvar observabilidade/métricas de auditoria (colunas podem não existir):", auditErr.message);
        }
      } catch (auditExc: any) {
        console.warn("[SIE V3] Exceção ao salvar observabilidade de auditoria:", auditExc.message || auditExc);
      }

      await auditLog(sb, {
        importId: args.importId, companyId: args.companyId,
        stage: "state_machine", event: "FINAL_STATE",
        input: { terminal, total, failed, review, ocrConfidence, incomeCount, expenseCount, veryLowConfCount } as any,
        output: { finalState, homologation_status, balance } as any,
        reason: `NTIEB Cap. 37/55/64: finalState=${finalState}, homologation=${homologation_status}, balance=${balance.reason}${terminal ? ` (terminal=${terminal})` : ""}`,
      });
    } catch (e: any) {
      console.warn("[SIE V3] Falha técnica ao executar processamento de finalização de importação:", e.message || e);
    }
  }

  return { rowsInserted, finalState, csvText };
}

// ============================================================
// Aplicar linha → v3_financial_transactions
// ============================================================

export async function applyRow(sb: SB, args: { rowId: string }): Promise<{ ok: boolean }> {
  const { data: row, error } = await sb
    .from("v3_import_rows").select("*").eq("id", args.rowId).single();
  if (error || !row) throw new Error("Linha não encontrada");
  if (row.status === "LINE_FAILED") throw new Error("Linha em falha — não pode ser aplicada");

  const canonical = row.canonical as CanonicalRow;
  const sugg = (row.suggestions ?? {}) as Record<string, any>;
  const type = sugg.type as "INCOME" | "EXPENSE" | undefined;
  if (!type) throw new Error("Linha sem classificação — revisar antes de aplicar");
  if (canonical.amount == null) throw new Error("Linha sem valor canônico");
  if (!canonical.transaction_date) throw new Error("Linha sem data canônica");

  const amount = Math.abs(canonical.amount);
  const subtype = sugg.subtype ?? (type === "INCOME" ? "RECEITA" : "DESPESA_EMPRESA");
  const isPersonal = subtype === "DESPESA_PESSOAL";

  // --- RECONCILIAÇÃO E CADASTRO DE CLIENTE (Item de Lançamento) ---
  let clientId = row.resolved_client_id;
  if (!clientId && canonical.client_name) {
    const cleanName = canonical.client_name.trim();
    // 1. Buscar na base de clientes cadastrados por nome
    const { data: existingClient } = await sb
      .from("clients")
      .select("id")
      .eq("company_id", row.company_id)
      .ilike("name", cleanName)
      .limit(1)
      .maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      // 2. Não localizou na base -> criar cadastro do cliente
      const { data: newClient, error: createClientErr } = await sb
        .from("clients")
        .insert({
          company_id: row.company_id,
          name: cleanName,
        })
        .select("id")
        .single();
      
      if (createClientErr || !newClient) {
        throw new Error(`Falha ao cadastrar cliente: ${createClientErr?.message}`);
      }
      clientId = newClient.id;
    }
  }

  // --- LANÇAR NA TABELA FINANCEIRA (CAIXA) ---
  const { data: tx, error: txErr } = await sb.from("v3_financial_transactions").insert({
    company_id: row.company_id,
    v3_row_id: row.id,
    type,
    category: subtype,
    description: canonical.description ?? "(sem descrição)",
    amount,
    transaction_date: canonical.transaction_date,
    client_id: clientId,
    service_id: row.resolved_service_id,
    is_personal: isPersonal,
    revenue_type: subtype === "APORTE" ? "APORTE" : null,
    notes: JSON.stringify({ canonical, suggestions: sugg }),
    engine: "v3",
  } as any).select("id").single();
  if (txErr) throw new Error(txErr.message);

  await sb.from("v3_import_rows").update({
    status: "applied",
    applied_result: { transaction_id: tx.id, applied_at: new Date().toISOString() },
    resolved_client_id: clientId,
  } as any).eq("id", row.id);

  await auditLog(sb, {
    importId: row.import_id, companyId: row.company_id, rowId: row.id,
    stage: "persistence", event: "APPLY",
    input: { canonical, suggestions: sugg } as any,
    output: { transaction_id: tx.id } as any,
    reason: `Aplicado como ${subtype} valor R$ ${amount}`,
    responsavel: "Usuário",
  });

  return { ok: true };
}

async function executePdfOcr(buffer: Uint8Array, filename: string): Promise<string> {
  const { getDocumentProxy, extractImages } = await import("unpdf");
  const { PipelineError } = await import("../ocr-normalizer.server");
  const pdf = await getDocumentProxy(buffer);
  
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new PipelineError("IA indisponível para OCR: LOVABLE_API_KEY ausente no ambiente de produção.", "OCR");
  }

  const resizeImageRGBA = (rgbaData: Uint8ClampedArray, width: number, height: number, maxDim = 1500) => {
    if (width <= maxDim && height <= maxDim) {
      return { data: rgbaData, width, height };
    }
    const scale = Math.min(maxDim / width, maxDim / height);
    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);
    const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
    for (let y = 0; y < newHeight; y++) {
      const srcY = Math.min(Math.floor(y / scale), height - 1);
      for (let x = 0; x < newWidth; x++) {
        const srcX = Math.min(Math.floor(x / scale), width - 1);
        const dstIdx = (y * newWidth + x) * 4;
        const srcIdx = (srcY * width + srcX) * 4;
        newData[dstIdx] = rgbaData[srcIdx];
        newData[dstIdx + 1] = rgbaData[srcIdx + 1];
        newData[dstIdx + 2] = rgbaData[srcIdx + 2];
        newData[dstIdx + 3] = rgbaData[srcIdx + 3];
      }
    }
    return { data: newData, width: newWidth, height: newHeight };
  };

  const convertToBMP32 = (rgbaData: Uint8ClampedArray, width: number, height: number) => {
    const fileHeaderSize = 14;
    const dibHeaderSize = 40;
    const headerSize = fileHeaderSize + dibHeaderSize;
    const imageSize = width * height * 4;
    const fileSize = headerSize + imageSize;
    const resBuffer = Buffer.alloc(fileSize);
    
    resBuffer.write("BM", 0);
    resBuffer.writeUInt32LE(fileSize, 2);
    resBuffer.writeUInt32LE(0, 6);
    resBuffer.writeUInt32LE(headerSize, 10);
    
    resBuffer.writeUInt32LE(dibHeaderSize, 14);
    resBuffer.writeInt32LE(width, 18);
    resBuffer.writeInt32LE(-height, 22);
    resBuffer.writeUInt16LE(1, 26);
    resBuffer.writeUInt16LE(32, 28);
    resBuffer.writeUInt32LE(0, 30);
    resBuffer.writeUInt32LE(imageSize, 34);
    resBuffer.writeInt32LE(2835, 38);
    resBuffer.writeInt32LE(2835, 42);
    resBuffer.writeUInt32LE(0, 46);
    resBuffer.writeUInt32LE(0, 50);
    
    let dstIdx = headerSize;
    for (let srcIdx = 0; srcIdx < rgbaData.length; srcIdx += 4) {
      resBuffer[dstIdx] = rgbaData[srcIdx + 2];
      resBuffer[dstIdx + 1] = rgbaData[srcIdx + 1];
      resBuffer[dstIdx + 2] = rgbaData[srcIdx];
      resBuffer[dstIdx + 3] = rgbaData[srcIdx + 3];
      dstIdx += 4;
    }
    return resBuffer;
  };

  let ocrCsvAccumulator = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const pageImages = await extractImages(pdf, i);
    if (pageImages && pageImages.length > 0) {
      for (let idx = 0; idx < pageImages.length; idx++) {
        const img = pageImages[idx];
        const convertToRGBA = (image: any) => {
          const { data: imgData, width: w, height: h, channels: ch } = image;
          if (ch === 4) {
            return { data: new Uint8ClampedArray(imgData), width: w, height: h };
          }
          
          const rgbaData = new Uint8ClampedArray(w * h * 4);
          let srcIdx = 0;
          let dstIdx = 0;
          
          for (let p = 0; p < w * h; p++) {
            if (ch === 3) {
              rgbaData[dstIdx] = imgData[srcIdx];
              rgbaData[dstIdx + 1] = imgData[srcIdx + 1];
              rgbaData[dstIdx + 2] = imgData[srcIdx + 2];
              rgbaData[dstIdx + 3] = 255;
              srcIdx += 3;
            } else if (ch === 1) {
              const val = imgData[srcIdx];
              rgbaData[dstIdx] = val;
              rgbaData[dstIdx + 1] = val;
              rgbaData[dstIdx + 2] = val;
              rgbaData[dstIdx + 3] = 255;
              srcIdx += 1;
            }
            dstIdx += 4;
          }
          return { data: rgbaData, width: w, height: h };
        };

        const rgbaImg = convertToRGBA(img);
        const resizedImg = resizeImageRGBA(rgbaImg.data, rgbaImg.width, rgbaImg.height, 1500);
        const bmpBuffer = convertToBMP32(resizedImg.data, resizedImg.width, resizedImg.height);
        const base64Bmp = bmpBuffer.toString("base64");
        const dataUrl = `data:image/bmp;base64,${base64Bmp}`;

        console.log(`[SIE V3 OCR] Enviando página ${i} imagem ${idx} para Lovable AI Gateway...`);
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Você é um analisador de documentos especialista em reconstruir tabelas. Sua tarefa é transcrever todo o conteúdo visível nesta imagem de extrato bancário diretamente no formato CSV. Mantenha fidelidade absoluta a TODOS os caracteres e dígitos, especialmente os centavos de todos os valores financeiros (ex: se o valor for 9,62 ou 9,70, mantenha exatamente os centavos 9,62 ou 9,70 no CSV; NUNCA arredonde valores nem remova/altere centavos). Não faça qualquer tipo de interpretação de dados, não resuma, não limpe e não aplique regras de negócio. Apenas identifique a estrutura física (tabelas, linhas e colunas) existente na imagem e monte um CSV correspondente. Se a imagem contiver textos fora de tabelas, represente-os como linhas de uma única célula no CSV. Retorne APENAS o código do CSV válido, sem blocos de código markdown (como ```csv), sem explicações e sem comentários."
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: dataUrl
                    }
                  }
                ]
              }
            ]
          })
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          throw new Error(`Erro no AI Gateway (${aiRes.status}): ${errText.slice(0, 200)}`);
        }

        const aiJson = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
        let pageText = aiJson.choices?.[0]?.message?.content ?? "";
        
        pageText = pageText.trim();
        if (pageText.startsWith("```")) {
          pageText = pageText.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
        }
        
        if (pageText) {
          ocrCsvAccumulator += pageText + "\n";
        }
      }
    }
  }

  return ocrCsvAccumulator;
}

async function executeNativePdfFormatter(pdf: any, apiKey: string): Promise<string> {
  let nativePagesText: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    if (items && items.length > 0) {
      const yThreshold = 5;
      const rowsMap: { y: number; items: typeof items }[] = [];
      
      for (const item of items) {
        if (!item.str) continue;
        const y = item.transform ? item.transform[5] : 0;
        let foundRow = rowsMap.find(r => Math.abs(r.y - y) <= yThreshold);
        if (foundRow) {
          foundRow.items.push(item);
        } else {
          rowsMap.push({ y, items: [item] });
        }
      }
      
      rowsMap.sort((a, b) => b.y - a.y);
      
      let pageText = "";
      for (const row of rowsMap) {
        row.items.sort((a, b) => (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0));
        
        let line = "";
        let lastXEnd = -1;
        for (const item of row.items) {
          const x = item.transform ? item.transform[4] : 0;
          const height = item.height || 10;
          const itemWidth = item.width || (item.str.length * (height * 0.6));
          
          if (lastXEnd === -1) {
            line = item.str;
          } else {
            const spacing = x - lastXEnd;
            if (spacing > 12) {
              line += "\t" + item.str;
            } else {
              line += (spacing > 2 ? " " : "") + item.str;
            }
          }
          lastXEnd = x + itemWidth;
        }
        pageText += line + "\n";
      }
      
      if (pageText.trim()) {
        nativePagesText.push(pageText);
      }
    }
  }
  
  if (nativePagesText.length === 0) return "";

  let nativeCsvAccumulator = "";
  for (let i = 0; i < nativePagesText.length; i++) {
    const pageTextContent = nativePagesText[i];
    console.log(`[SIE V3] Enviando página nativa ${i + 1} para formatação CSV via Gemini...`);
    
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Você é um especialista em estruturação de dados e reconstrução de tabelas. Sua tarefa é converter o texto de extrato bancário fornecido abaixo diretamente no formato CSV. O texto original foi extraído de um PDF nativo e preserva as quebras de linha e colunas (separadas por tabulação '\\t' ou múltiplos espaços). Identifique a estrutura física das tabelas e alinhe corretamente as informações em colunas correspondentes do CSV (como Data, Descrição, Documento, Valor, Saldo, etc.). Mantenha fidelidade absoluta a TODOS os caracteres e dígitos, especialmente os centavos de todos os valores financeiros (ex: se o valor for 9,62 ou 9,70, mantenha exatamente os centavos 9,62 ou 9,70 no CSV; NUNCA arredonde valores nem remova/altere centavos). Certifique-se de que cada registro ocupe uma única linha do CSV com todas as suas respectivas colunas preenchidas. Não resuma, não ignore linhas, não modifique os textos/valores originais e não aplique nenhuma regra de negócio. Retorne APENAS o código do CSV válido, sem blocos de código markdown (como ```csv), sem explicações e sem comentários.\n\nTexto original:\n" + pageTextContent
              }
            ]
          }
        ]
      })
    });
    
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Erro no AI Gateway (${aiRes.status}): ${errText.slice(0, 200)}`);
    }
    
    const aiJson = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
    let pageCsv = aiJson.choices?.[0]?.message?.content ?? "";
    pageCsv = pageCsv.trim();
    if (pageCsv.startsWith("```")) {
      pageCsv = pageCsv.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    if (pageCsv) {
      nativeCsvAccumulator += pageCsv + "\n";
    }
  }
  return nativeCsvAccumulator;
}


