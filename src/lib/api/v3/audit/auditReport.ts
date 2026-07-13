import type { ImportAuditReport } from "./auditTypes";

export function generateAuditTextReport(report: ImportAuditReport): string {
  const s = report.summary;
  const p2 = report.phases.phase2.totals;
  const p3 = report.phases.phase3.totals;
  const p4 = report.phases.phase4.totals;
  const p5 = report.phases.phase5.totals;
  const p6 = report.phases.phase6.totals;

  return `
=== RELATÓRIO DE AUDITORIA SIE V3 ===
Import ID: ${s.importId}
Arquivo: ${s.filename || "N/A"}
Status Global: ${s.status}
Banco Emissor: ${s.issuerBank || "Não identificado"}
------------------------------------
Métricas por Fase:
Páginas extraídas (Fase 2): ${s.pagesExtracted} (Unresolved: ${p2.pages_with_unresolved_layout || 0})
Linhas físicas extraídas: ${s.physicalLinesExtracted}
Linhas descartadas (Fase 3): ${p3.discarded_rows} (Header repetido: ${p3.repeated_headers_removed}, Admin/Footer: ${(p3.institutional_lines_discarded || 0) + (p3.metadata_lines_discarded || 0) + (p3.footer_lines_discarded || 0)})
Saldos/Resumos capturados: ${(p3.balance_lines_captured || 0) + (p3.summary_lines_captured || 0) + (p3.total_lines_captured || 0)}
Blocos criados (Fase 4): ${s.blocksCreated} (Multilíngua/Appended: ${p4.blocks_appended}, Cruza página: ${p4.blocks_crossing_pages})
Datas na Fase 5: Explícitas: ${p5.dates_explicit}, Herdadas: ${p5.dates_inherited}, Ausentes: ${p5.dates_missing}, Conflitos: ${p5.temporal_conflicts}
Decisão das Linhas (Fase 6):
  Aprovadas (status OK): ${s.rowsApproved}
  Revisão: ${s.rowsReview}
  Falhas: ${s.rowsFailed}
------------------------------------
Métricas de Observabilidade:
  Conciliação de contadores: ${report.consistencyChecks.countersBalanced ? "EQUILIBRADO" : "DIVERGENTE"}
  Avisos de execução: ${s.warningsCount}
  Erros de execução: ${s.errorsCount}
====================================
`;
}
export default generateAuditTextReport;
