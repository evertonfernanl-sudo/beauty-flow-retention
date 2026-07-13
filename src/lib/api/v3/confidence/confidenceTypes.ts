export type ConfidenceBand =
  | "MUITO_ALTA"
  | "ALTA"
  | "MEDIA"
  | "BAIXA"
  | "MUITO_BAIXA";

export type StructuralGateResult = {
  passed: boolean;
  hardFailures: string[];
  reviewReasons: string[];
  warnings: string[];
};

export type RowConfidenceBreakdown = {
  directionConfidence: number;
  structuralConfidence: number;
  semanticConfidence: number;
  overallConfidence: number;
  directionBand: ConfidenceBand;
  structuralBand: ConfidenceBand;
  semanticBand: ConfidenceBand;
  overallBand: ConfidenceBand;
};

export type RowQualityDecision = {
  gate: StructuralGateResult;
  confidence: RowConfidenceBreakdown;
  finalStatus: "LINE_APPROVED" | "LINE_REVIEW" | "LINE_FAILED";
  reasonCodes: string[];
  reasons: string[];
};

export type ConfidenceWeights = {
  structural: number;
  direction: number;
  semantic: number;
};

export type StructuralCaps = {
  MUITO_ALTA: number;
  ALTA: number;
  MEDIA: number;
  BAIXA: number;
  MUITO_BAIXA: number;
};
