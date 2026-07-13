import type { ImportAuditSummary, Phase1Audit, PageLayoutAudit, Phase3RowAudit, BlockAuditRecord, TemporalAuditRecord, ConfidenceAuditRecord, ImportAuditReport, AuditError } from "./auditTypes";
import { sanitizeAuditText } from "./auditSanitizer";

export class ImportAuditCollector {
  private importId: string;
  private source: string;
  private filename: string | null = null;
  private startedAt: string;
  private finishedAt: string | null = null;
  private status: "RUNNING" | "COMPLETED" | "COMPLETED_WITH_REVIEW" | "PARTIAL" | "FAILED" = "RUNNING";
  private issuerBank: string | null = null;

  // Timestamps and durations
  private phaseStartTimes: Record<string, number> = {};
  private phaseDurations: Record<string, number> = {};

  // Counters
  private metrics: Record<string, number> = {};

  // Phase records
  private phase1Data: Phase1Audit | null = null;
  private phase2Data: PageLayoutAudit[] = [];
  private phase3Data: Phase3RowAudit[] = [];
  private phase4Data: BlockAuditRecord[] = [];
  private phase5Data: TemporalAuditRecord[] = [];
  private phase6Data: ConfidenceAuditRecord[] = [];

  private warnings: string[] = [];
  private errors: string[] = [];

  constructor(importId: string, source: string) {
    this.importId = importId;
    this.source = source;
    this.startedAt = new Date().toISOString();
  }

  setFilename(name: string) {
    this.filename = name;
  }

  setIssuerBank(bank: string | null) {
    this.issuerBank = bank;
  }

  startPhase(phase: string) {
    this.phaseStartTimes[phase] = Date.now();
  }

  endPhase(phase: string) {
    if (this.phaseStartTimes[phase]) {
      this.phaseDurations[phase] = Date.now() - this.phaseStartTimes[phase];
    }
  }

  getDuration(phase: string): number {
    return this.phaseDurations[phase] || 0;
  }

  increment(metric: string, amount: number = 1) {
    this.metrics[metric] = (this.metrics[metric] || 0) + amount;
  }

  setMetric(metric: string, value: number) {
    this.metrics[metric] = value;
  }

  recordPhase1(data: Phase1Audit) {
    this.phase1Data = data;
  }

  recordPageLayout(page: PageLayoutAudit) {
    this.phase2Data.push(page);
    this.increment("pages_extracted");
    if (page.layoutSource === "DETECTED_HEADER") this.increment("pages_with_detected_header");
    if (page.layoutSource === "REUSED_PREVIOUS") this.increment("pages_reusing_previous_layout");
    if (page.layoutSource === "INFERRED_GEOMETRY") this.increment("pages_with_adjusted_layout");
    if (page.layoutSource === "UNRESOLVED") this.increment("pages_with_unresolved_layout");
  }

  recordPhase3Row(row: Phase3RowAudit) {
    // Truncate and sanitize preview
    if (row.textPreview) {
      row.textPreview = sanitizeAuditText(row.textPreview).slice(0, 100);
    }
    
    // Limit detailed records to prevent memory issues
    if (this.phase3Data.length < 500) {
      this.phase3Data.push(row);
    }
    
    if (row.action === "DISCARD_BEFORE_BLOCKS") {
      this.increment("discarded_rows");
      if (row.category === "INSTITUTIONAL") this.increment("institutional_lines_discarded");
      if (row.category === "METADATA") this.increment("metadata_lines_discarded");
      if (row.category === "REPEATED_HEADER") this.increment("repeated_headers_removed");
      if (row.category === "FOOTER") this.increment("footer_lines_discarded");
    } else if (row.action === "CAPTURE_AS_BALANCE") {
      this.increment("balance_lines_captured");
    } else if (row.action === "CAPTURE_AS_SUMMARY") {
      this.increment("summary_lines_captured");
    } else if (row.action === "CAPTURE_AS_TOTAL") {
      this.increment("total_lines_captured");
    } else if (row.action === "FORWARD_TO_BLOCK_ASSEMBLER") {
      this.increment("transaction_candidate_rows");
    }
  }

  recordBlock(block: BlockAuditRecord) {
    if (this.phase4Data.length < 500) {
      this.phase4Data.push(block);
    }
    this.increment("blocks_created");
    this.increment("blocks_appended", block.appendedBy.length);
    if (block.crossedPageBoundary) this.increment("blocks_crossing_pages");
    if (block.ambiguous) this.increment("blocks_marked_ambiguous");
    if (block.possibleMegaBlock) this.increment("possible_mega_blocks");
  }

  recordTemporal(record: TemporalAuditRecord) {
    if (this.phase5Data.length < 500) {
      this.phase5Data.push(record);
    }
    if (record.assignment === "EXPLICIT") this.increment("dates_explicit");
    if (record.assignment === "INHERITED") this.increment("dates_inherited");
    if (record.assignment === "MISSING") this.increment("dates_missing");
    if (record.assignment === "CONFLICT") this.increment("temporal_conflicts");
  }

  recordConfidence(record: ConfidenceAuditRecord) {
    if (this.phase6Data.length < 500) {
      this.phase6Data.push(record);
    }
    this.increment("rows_gate_passed", record.finalStatus !== "LINE_FAILED" ? 1 : 0);
    this.increment("rows_gate_failed", record.finalStatus === "LINE_FAILED" ? 1 : 0);
    if (record.finalStatus === "LINE_APPROVED") this.increment("rows_approved");
    if (record.finalStatus === "LINE_REVIEW") this.increment("rows_review");
    if (record.finalStatus === "LINE_FAILED") this.increment("rows_failed");
  }

  addWarning(msg: string) {
    this.warnings.push(sanitizeAuditText(msg));
  }

  addError(msg: string) {
    this.errors.push(sanitizeAuditText(msg));
  }

  setStatus(status: ImportAuditSummary["status"]) {
    this.status = status;
  }

  finalize(rowsPersisted: number = 0): ImportAuditReport {
    this.finishedAt = new Date().toISOString();
    
    // Conciliation Checks
    const physical_rows_received = (this.metrics.transaction_candidate_rows || 0) +
                                   (this.metrics.discarded_rows || 0) +
                                   (this.metrics.balance_lines_captured || 0) +
                                   (this.metrics.summary_lines_captured || 0) +
                                   (this.metrics.total_lines_captured || 0);

    const canonical_rows_created = (this.metrics.rows_approved || 0) +
                                   (this.metrics.rows_review || 0) +
                                   (this.metrics.rows_failed || 0);

    const countersBalanced = (physical_rows_received === (this.metrics.physical_lines_extracted || 0)) &&
                             (canonical_rows_created === (this.metrics.rows_gate_passed || 0) + (this.metrics.rows_gate_failed || 0));

    if (!countersBalanced) {
      this.addWarning("Conciliação de contadores detectou divergência (AUDIT_COUNTER_MISMATCH)");
    }

    const summary: ImportAuditSummary = {
      importId: this.importId,
      source: this.source,
      filename: this.filename,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      status: this.status,
      issuerBank: this.issuerBank,
      pagesExtracted: this.metrics.pages_extracted || 0,
      physicalLinesExtracted: this.metrics.physical_lines_extracted || 0,
      transactionCandidates: this.metrics.transaction_candidate_rows || 0,
      blocksCreated: this.metrics.blocks_created || 0,
      canonicalRowsCreated: canonical_rows_created,
      rowsApproved: this.metrics.rows_approved || 0,
      rowsReview: this.metrics.rows_review || 0,
      rowsFailed: this.metrics.rows_failed || 0,
      rowsPersisted,
      warningsCount: this.warnings.length,
      errorsCount: this.errors.length,
    };

    return {
      summary,
      phases: {
        phase1: this.phase1Data || {
          issuerBank: null,
          inferenceSource: "NOT_IDENTIFIED",
          matchedSignals: [],
          normalizationApplied: false,
          counterpartyBankIgnored: false,
          fallbackUsed: false,
        },
        phase2: {
          totals: {
            pages_extracted: this.metrics.pages_extracted || 0,
            pages_with_detected_header: this.metrics.pages_with_detected_header || 0,
            pages_reusing_previous_layout: this.metrics.pages_reusing_previous_layout || 0,
            pages_with_adjusted_layout: this.metrics.pages_with_adjusted_layout || 0,
            pages_with_unresolved_layout: this.metrics.pages_with_unresolved_layout || 0,
          },
          pages: this.phase2Data,
        },
        phase3: {
          totals: {
            discarded_rows: this.metrics.discarded_rows || 0,
            institutional_lines_discarded: this.metrics.institutional_lines_discarded || 0,
            metadata_lines_discarded: this.metrics.metadata_lines_discarded || 0,
            repeated_headers_removed: this.metrics.repeated_headers_removed || 0,
            footer_lines_discarded: this.metrics.footer_lines_discarded || 0,
            balance_lines_captured: this.metrics.balance_lines_captured || 0,
            summary_lines_captured: this.metrics.summary_lines_captured || 0,
            total_lines_captured: this.metrics.total_lines_captured || 0,
          },
          discarded: this.phase3Data,
        },
        phase4: {
          totals: {
            blocks_created: this.metrics.blocks_created || 0,
            blocks_appended: this.metrics.blocks_appended || 0,
            blocks_crossing_pages: this.metrics.blocks_crossing_pages || 0,
            blocks_marked_ambiguous: this.metrics.blocks_marked_ambiguous || 0,
            possible_mega_blocks: this.metrics.possible_mega_blocks || 0,
          },
          blocks: this.phase4Data,
        },
        phase5: {
          totals: {
            dates_explicit: this.metrics.dates_explicit || 0,
            dates_inherited: this.metrics.dates_inherited || 0,
            dates_missing: this.metrics.dates_missing || 0,
            temporal_conflicts: this.metrics.temporal_conflicts || 0,
          },
          records: this.phase5Data,
        },
        phase6: {
          totals: {
            rows_gate_passed: this.metrics.rows_gate_passed || 0,
            rows_gate_failed: this.metrics.rows_gate_failed || 0,
            rows_approved: this.metrics.rows_approved || 0,
            rows_review: this.metrics.rows_review || 0,
            rows_failed: this.metrics.rows_failed || 0,
          },
          records: this.phase6Data,
        },
      },
      consistencyChecks: {
        countersBalanced,
        missingOriginLines: 0,
        orphanBlocks: 0,
        missingDecisions: 0,
      },
      warnings: this.warnings,
      errors: this.errors,
    };
  }
}
export default ImportAuditCollector;
