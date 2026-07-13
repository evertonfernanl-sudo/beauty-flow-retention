// NTIEB Cap. 7, 13, 14, 16.4 — Controle de contexto temporal e herança de datas.

export type TemporalAssignmentKind = "EXPLICIT" | "INHERITED" | "MISSING" | "CONFLICT" | "DATE_GROUP_MARKER";

export type TemporalContext = {
  lastValidTransactionDate: string | null;
  sourcePageNumber: number | null;
  sourcePhysicalLine: number | null;
  sourceBlockId: string | null;
  sourceKind: "EXPLICIT_TRANSACTION" | "DATE_GROUP_MARKER" | null;
  valid: boolean;
  invalidationReason?: string | null;
  currentPageNumber?: number | null;
  chronologicalDirection: "ASCENDING" | "DESCENDING" | "UNKNOWN";
  explicitDatesDetected: string[];
};

export type TemporalDecision = {
  assignment: TemporalAssignmentKind;
  date: string | null;
  reasonCode: string;
  reasons: string[];
  inheritedFrom?: {
    pageNumber: number;
    physicalLine: number;
    blockId?: string | null;
  } | null;
  contextUpdated: boolean;
  contextInvalidated: boolean;
};

export type AssembledBlock = {
  row: string[];
  pageStart: number;
  pageEnd: number;
  originLines: Array<{ pageNumber: number; physicalLine: number }>;
  hasExplicitDate: boolean;
  hasExplicitValue: boolean;
  isAmbiguous: boolean;
  ambiguityReasons: string[];
};

export type TemporalResolvedBlock = {
  row: string[];
  dateRaw: string | null;
  dateNormalized: string | null;
  dateDetected: boolean;
  dateInherited: boolean;
  dateAssignment: TemporalAssignmentKind;
  dateSourcePage?: number | null;
  dateSourcePhysicalLine?: number | null;
  dateSourceBlockId?: string | null;
  dateReasonCode: string;
  blockId?: string;
  // Phase 6 additions:
  pageStart?: number;
  pageEnd?: number;
  originLines?: Array<{ pageNumber: number; physicalLine: number }>;
  isAmbiguous?: boolean;
  ambiguityReasons?: string[];
  hasExplicitDate?: boolean;
  hasExplicitValue?: boolean;
};
