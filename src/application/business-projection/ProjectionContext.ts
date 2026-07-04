import type { CanonicalRow } from "@/lib/api/v3/pipeline.server";

export interface ProjectionContext {
  companyId: string;
  importId: string;
  rowId: string;
  canonicalData: CanonicalRow;
  suggestions: {
    type?: "INCOME" | "EXPENSE";
    subtype?: "RECEITA" | "APORTE" | "DESPESA_EMPRESA" | "DESPESA_PESSOAL";
    isBankFee?: boolean;
    isBankInterest?: boolean;
    [key: string]: any;
  };
  appliedResult: {
    transactionId: string;
    clientId?: string | null;
    serviceId?: string | null;
    appliedAt: string;
  };
}
