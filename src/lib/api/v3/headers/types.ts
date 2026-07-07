export type CanonicalHeader =
  | "client_name"
  | "description"
  | "amount"
  | "transaction_date"
  | "balance"
  | "document_number"
  | "cpf_cnpj"
  | "phone"
  | "email"
  | "debit_amount"
  | "credit_amount"
  | "movement_type"
  | "raw_extra";

export interface HeaderAlias {
  aliases: string[];
  regex?: RegExp[];
  priority: number;
  deprecated?: string[];
  bankOverrides?: Record<string, string[]>;
}

export type HeaderMatchLevel = "EXACT" | "REGEX" | "NORMALIZED" | "FUZZY";

export interface HeaderMatch {
  field: CanonicalHeader;
  level: HeaderMatchLevel;
  aliasMatched: string;
  confidence: number;
}

export interface HeaderScore {
  score: number;
  confidence: number;
  matchedFields: Map<string, HeaderMatch>;
}

export interface HeaderDetectionResult {
  headerIndex: number;
  score: number;
  confidence: number;
  headers: string[];
  matchedFields: Record<string, string>;
  headerFailed?: boolean;
}

export type FieldMap = Partial<Record<CanonicalHeader, string>>;
