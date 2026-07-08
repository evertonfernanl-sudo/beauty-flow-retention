// NTIEB v1.0 — Norma Técnica de Interpretação de Extratos Bancários
// Fonte oficial: docs/ntieb-v1.md
// Este módulo é a fonte única de verdade para:
//   - Matriz oficial de classificação (Cap. 34)
//   - Níveis de confiança (Cap. 36 e 61)
//   - Status de homologação (Cap. 64)
//   - Versionamento (Cap. 65)

export const NTIEB_VERSION = "1.0";
export const PARSER_VERSION = "v3.1.0";

// ---------------------------------------------------------------------------
// Cap. 34 — Matriz Oficial de Classificação
// Operação -> Natureza (RECEITA/DESPESA). Fonte declarativa.
// ---------------------------------------------------------------------------
export type NtiebNature = "RECEITA" | "DESPESA";

export const OFFICIAL_MATRIX: ReadonlyArray<{
  operation: string;
  nature: NtiebNature;
  rule: string;
}> = [
  // Receitas
  { operation: "Transferência Recebida", nature: "RECEITA", rule: "34.1" },
  { operation: "PIX Recebido", nature: "RECEITA", rule: "34.1" },
  { operation: "TED Recebida", nature: "RECEITA", rule: "34.1" },
  { operation: "DOC Recebido", nature: "RECEITA", rule: "34.1" },
  { operation: "Crédito em Conta", nature: "RECEITA", rule: "34.1" },
  { operation: "Depósito", nature: "RECEITA", rule: "34.1" },
  { operation: "Recebimento", nature: "RECEITA", rule: "34.1" },
  { operation: "Resgate", nature: "RECEITA", rule: "34.1" },
  { operation: "Rendimento", nature: "RECEITA", rule: "34.1" },
  { operation: "Estorno de Débito", nature: "RECEITA", rule: "34.1" },
  // Despesas
  { operation: "Transferência Enviada", nature: "DESPESA", rule: "34.2" },
  { operation: "PIX Enviado", nature: "DESPESA", rule: "34.2" },
  { operation: "TED Enviada", nature: "DESPESA", rule: "34.2" },
  { operation: "DOC Enviado", nature: "DESPESA", rule: "34.2" },
  { operation: "Pagamento", nature: "DESPESA", rule: "34.2" },
  { operation: "Compra", nature: "DESPESA", rule: "34.2" },
  { operation: "Aplicação", nature: "DESPESA", rule: "34.2" },
  { operation: "Tarifa", nature: "DESPESA", rule: "34.2" },
  { operation: "IOF", nature: "DESPESA", rule: "34.2" },
  { operation: "Juros", nature: "DESPESA", rule: "34.2" },
  { operation: "Multa", nature: "DESPESA", rule: "34.2" },
  { operation: "Débito Automático", nature: "DESPESA", rule: "34.2" },
];

// Mapa Pattern Library (V3) -> entrada da Matriz Oficial Cap. 34.
// Usado para citar a regra NTIEB aplicada a cada linha.
export const PATTERN_TO_MATRIX: Record<string, { operation: string; rule: string }> = {
  PIX_RECEIVED: { operation: "PIX Recebido", rule: "34.1" },
  PIX_SENT: { operation: "PIX Enviado", rule: "34.2" },
  TED_RECEIVED: { operation: "TED Recebida", rule: "34.1" },
  TED_SENT: { operation: "TED Enviada", rule: "34.2" },
  DOC_RECEIVED: { operation: "DOC Recebido", rule: "34.1" },
  DOC_SENT: { operation: "DOC Enviado", rule: "34.2" },
  TRANSFER_RECEIVED: { operation: "Transferência Recebida", rule: "34.1" },
  TRANSFER_SENT: { operation: "Transferência Enviada", rule: "34.2" },
  DEPOSIT: { operation: "Depósito", rule: "34.1" },
  WITHDRAWAL: { operation: "Compra", rule: "34.2" },
  BOLETO_PAYMENT: { operation: "Pagamento", rule: "34.2" },
  PAYMENT: { operation: "Pagamento", rule: "34.2" },
  CARD_SHOPPING: { operation: "Compra", rule: "34.2" },
  CARD_PAYMENT: { operation: "Pagamento", rule: "34.2" },
  SYSTEM_RDB_APPLICATION: { operation: "Aplicação", rule: "34.2" },
  SYSTEM_RDB_REDEMPTION: { operation: "Resgate", rule: "34.1" },
  SYSTEM_RENDIMENTO: { operation: "Rendimento", rule: "34.1" },
  SYSTEM_CREDIT_IN_ACCOUNT: { operation: "Crédito em Conta", rule: "34.1" },
  SYSTEM_LOAN: { operation: "Pagamento", rule: "34.2" },
  SYSTEM_LOAN_REDEMPTION: { operation: "Recebimento", rule: "34.1" },
  SYSTEM_FEE: { operation: "Tarifa", rule: "34.2" },
  SYSTEM_INTERNAL_TRANSFER: { operation: "Transferência Enviada", rule: "32" },
};

// ---------------------------------------------------------------------------
// Cap. 36 e 61 — Níveis de confiança
// ---------------------------------------------------------------------------
export type ConfidenceLevel =
  | "MUITO_ALTA"
  | "ALTA"
  | "MEDIA"
  | "BAIXA"
  | "MUITO_BAIXA";

// Mapeia score numérico (0..100) para nível oficial NTIEB.
// Faixas calibradas com a tabela de pesos atual (Cap. 11.3 do plano V3):
//   ≥ 90  → Muito Alta (evidência explícita, ex.: coluna Crédito/Débito preenchida)
//   ≥ 75  → Alta (contexto financeiro inequívoco)
//   ≥ 60  → Média (reconstrução por bloco / pattern library)
//   ≥ 40  → Baixa (OCR degradado)
//    < 40 → Muito Baixa (inferência) — SEMPRE vai para revisão manual (Cap. 61)
export function toConfidenceLevel(score: number | null | undefined): ConfidenceLevel {
  const s = typeof score === "number" ? score : 0;
  if (s >= 90) return "MUITO_ALTA";
  if (s >= 75) return "ALTA";
  if (s >= 60) return "MEDIA";
  if (s >= 40) return "BAIXA";
  return "MUITO_BAIXA";
}

export function requiresManualReview(level: ConfidenceLevel): boolean {
  // Cap. 61: nunca importar automaticamente lançamentos Muito Baixa.
  return level === "MUITO_BAIXA";
}

// ---------------------------------------------------------------------------
// Cap. 64 — Homologação da importação
// ---------------------------------------------------------------------------
export type HomologationStatus =
  | "APROVADA"
  | "APROVADA_COM_ALERTAS"
  | "PENDENTE"
  | "REJEITADA";

// Máquina de estados V3 já entrega SUCCESS / PARTIAL_SUCCESS / REVIEW / FAILED.
// Mapeamento oficial para os 4 status da NTIEB Cap. 64:
export function toHomologationStatus(
  finalState: "SUCCESS" | "PARTIAL_SUCCESS" | "REVIEW" | "FAILED"
): HomologationStatus {
  switch (finalState) {
    case "SUCCESS":
      return "APROVADA";
    case "PARTIAL_SUCCESS":
      return "APROVADA_COM_ALERTAS";
    case "REVIEW":
      return "PENDENTE";
    case "FAILED":
    default:
      return "REJEITADA";
  }
}

// Rótulos amigáveis para UI (pt-BR).
export const HOMOLOGATION_LABEL: Record<HomologationStatus, string> = {
  APROVADA: "Importação Aprovada",
  APROVADA_COM_ALERTAS: "Aprovada com Alertas",
  PENDENTE: "Pendente de Revisão",
  REJEITADA: "Rejeitada",
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  MUITO_ALTA: "Muito Alta",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
  MUITO_BAIXA: "Muito Baixa",
};

// ---------------------------------------------------------------------------
// Regra aplicada — helper para citar capítulo NTIEB por decisão
// ---------------------------------------------------------------------------
export function formatRuleApplied(chapter: string, detail?: string): string {
  return detail ? `NTIEB ${chapter} — ${detail}` : `NTIEB ${chapter}`;
}
