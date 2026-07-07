import {
  SYSTEM_PATTERNS,
  INVESTMENT_PATTERNS,
  PIX_PATTERNS,
  TED_PATTERNS,
  DOC_PATTERNS,
  BOLETO_PATTERNS,
  CARD_PATTERNS,
  TRANSFER_PATTERNS,
  WITHDRAWAL_PATTERNS,
  DEPOSIT_PATTERNS,
  PAYMENT_PATTERNS,
} from "./aliases";

export type TransactionPatternKey =
  | "SYSTEM_INTERNAL_TRANSFER"
  | "SYSTEM_FEE"
  | "SYSTEM_CREDIT_IN_ACCOUNT"
  | "SYSTEM_LOAN_REDEMPTION"
  | "SYSTEM_LOAN"
  | "SYSTEM_RDB_REDEMPTION"
  | "SYSTEM_RDB_APPLICATION"
  | "SYSTEM_RENDIMENTO"
  | "PIX_RECEIVED"
  | "PIX_SENT"
  | "TED_RECEIVED"
  | "TED_SENT"
  | "DOC_RECEIVED"
  | "DOC_SENT"
  | "BOLETO_PAYMENT"
  | "CARD_SHOPPING"
  | "CARD_PAYMENT"
  | "TRANSFER_RECEIVED"
  | "TRANSFER_SENT"
  | "WITHDRAWAL"
  | "DEPOSIT"
  | "PAYMENT"
  | null;

export function detectTransactionPattern(descNormalized: string | null | undefined): TransactionPatternKey {
  if (!descNormalized) return null;

  const order = [
    SYSTEM_PATTERNS,
    INVESTMENT_PATTERNS,
    PIX_PATTERNS,
    TED_PATTERNS,
    DOC_PATTERNS,
    BOLETO_PATTERNS,
    CARD_PATTERNS,
    TRANSFER_PATTERNS,
    WITHDRAWAL_PATTERNS,
    DEPOSIT_PATTERNS,
    PAYMENT_PATTERNS,
  ];

  for (const patternGroup of order) {
    for (const rule of patternGroup) {
      if (rule.regex.test(descNormalized)) {
        return rule.key as TransactionPatternKey;
      }
    }
  }

  return null;
}

export function isSystemPattern(key: TransactionPatternKey): boolean {
  if (!key) return false;
  return key.startsWith("SYSTEM_") || key === "WITHDRAWAL" || key === "DEPOSIT";
}
