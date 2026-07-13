import type { ConfidenceBand } from "../confidence/confidenceTypes";

export type AuditIdentifiers = {
  importId: string;
  sourceFileId?: string | null;
  pageNumber?: number | null;
  physicalLine?: number | null;
  blockId?: string | null;
  canonicalRowId?: string | null;
  persistedRowId?: string | null;
};

export type ImportAuditSummary = {
  importId: string;
  source: string;
  filename?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  status:
    | "RUNNING"
    | "COMPLETED"
    | "COMPLETED_WITH_REVIEW"
    | "PARTIAL"
    | "FAILED";
  issuerBank?: string | null;
  pagesExtracted?: number;
  physicalLinesExtracted?: number;
  transactionCandidates?: number;
  blocksCreated?: number;
  canonicalRowsCreated?: number;
  rowsApproved?: number;
  rowsReview?: number;
  rowsFailed?: number;
  rowsPersisted?: number;
  warningsCount?: number;
  errorsCount?: number;
};

export type Phase1Audit = {
  issuerBank: string | null;
  inferenceSource:
    | "INSTITUTIONAL"
    | "STRUCTURED_METADATA"
    | "FILENAME"
    | "BODY_FALLBACK"
    | "NOT_IDENTIFIED";
  matchedSignals: string[];
  normalizationApplied: boolean;
  counterpartyBankIgnored: boolean;
  fallbackUsed: boolean;
};

export type PageLayoutAudit = {
  pageNumber: number;
  layoutSource:
    | "DETECTED_HEADER"
    | "REUSED_PREVIOUS"
    | "INFERRED_GEOMETRY"
    | "UNRESOLVED";
  layoutConfidence: "HIGH" | "MEDIUM" | "LOW";
  equivalentToPage?: number | null;
  detectedColumnCount?: number;
  reusedColumnCount?: number;
  appliedOffset?: number | null;
  offsetResidual?: number | null;
  compatibleRowRatio?: number | null;
  reasons: string[];
};

export type Phase3RowAudit = {
  pageNumber?: number | null;
  physicalLine?: number | null;
  category:
    | "INSTITUTIONAL"
    | "METADATA"
    | "REPEATED_HEADER"
    | "FOOTER"
    | "SUMMARY"
    | "BALANCE"
    | "TOTAL"
    | "EMPTY"
    | "AMBIGUOUS"
    | "TRANSACTION_CANDIDATE";
  action: string;
  reasonCode: string;
  confidence: string;
  matchedSignals: string[];
  textPreview?: string;
};

export type BlockAuditRecord = {
  blockId: string;
  pageStart: number;
  pageEnd: number;
  originLines: Array<{
    pageNumber: number;
    physicalLine: number;
  }>;
  openedBy: string;
  closedBy: string;
  appendedBy: Array<{
    pageNumber: number;
    physicalLine: number;
    reasonCode: string;
  }>;
  descriptionLineCount: number;
  crossedPageBoundary: boolean;
  ambiguous: boolean;
  ambiguityReasons: string[];
  valueConflict: boolean;
  documentConflict: boolean;
  possibleMegaBlock: boolean;
};

export type TemporalAuditRecord = {
  blockId: string;
  assignment: "EXPLICIT" | "INHERITED" | "MISSING" | "CONFLICT";
  normalizedDate?: string | null;
  reasonCode: string;
  sourceBlockId?: string | null;
  sourcePageNumber?: number | null;
  sourcePhysicalLine?: number | null;
  inheritedAcrossPage: boolean;
  contextInvalidated: boolean;
  invalidationReason?: string | null;
  conflictReasons: string[];
};

export type ConfidenceAuditRecord = {
  blockId: string;
  directionConfidence: number;
  structuralConfidence: number;
  semanticConfidence: number;
  overallConfidence: number;
  directionBand: string;
  structuralBand: string;
  semanticBand: string;
  overallBand: string;
  capsApplied: string[];
  hardFailures: string[];
  reviewReasons: string[];
  finalStatus: "LINE_APPROVED" | "LINE_REVIEW" | "LINE_FAILED";
};

export type AuditTrace = {
  version: string;
  source: {
    pageStart: number;
    pageEnd: number;
    originLines: Array<{
      pageNumber: number;
      physicalLine: number;
    }>;
  };
  block: {
    blockId: string;
    openedBy: string;
    closedBy: string;
  };
  temporal: {
    assignment: string;
    reasonCode: string;
  };
  confidence: {
    structural: number;
    semantic: number;
    direction: number;
    overall: number;
    finalStatus: string;
  };
};

export type AuditError = {
  phase: string;
  code: string;
  message: string;
  recoverable: boolean;
  blockId?: string | null;
  pageNumber?: number | null;
  physicalLine?: number | null;
};

export type ImportAuditReport = {
  summary: ImportAuditSummary;
  phases: {
    phase1: Phase1Audit;
    phase2: {
      totals: Record<string, number>;
      pages: PageLayoutAudit[];
    };
    phase3: {
      totals: Record<string, number>;
      discarded: Phase3RowAudit[];
    };
    phase4: {
      totals: Record<string, number>;
      blocks: BlockAuditRecord[];
    };
    phase5: {
      totals: Record<string, number>;
      records: TemporalAuditRecord[];
    };
    phase6: {
      totals: Record<string, number>;
      records: ConfidenceAuditRecord[];
    };
  };
  consistencyChecks: {
    countersBalanced: boolean;
    missingOriginLines: number;
    orphanBlocks: number;
    missingDecisions: number;
  };
  warnings: string[];
  errors: string[];
};

export type AuditLimits = {
  maxReasonCountPerRecord: number;
  maxPreviewLength: number;
  maxOriginLinesPerBlock: number;
  maxDetailedRowsPerImport: number;
  maxAuditJsonBytes: number;
};
