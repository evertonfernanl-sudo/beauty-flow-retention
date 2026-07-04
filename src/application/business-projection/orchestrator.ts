import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectionContext } from "./ProjectionContext";
import { projectFinancial } from "./projections/financial";
import { projectAppointments } from "./projections/appointments";
import { projectClients } from "./projections/clients";
import { projectRetention } from "./projections/retention";
import { projectBehavior } from "./projections/behavior";
import { projectLearning } from "./projections/learning";

export async function projectV3RowToBusiness(
  sb: SupabaseClient<Database>,
  context: ProjectionContext
): Promise<{ success: boolean; durationMs: number; errors: Array<{ projection: string; message: string }> }> {
  const startTime = Date.now();
  console.log(`[PROJECTION ORCHESTRATOR] Iniciando ciclo para RowID=${context.rowId}, CompanyID=${context.companyId}`);

  const projections = [
    { name: "projectFinancial", fn: projectFinancial },
    { name: "projectAppointments", fn: projectAppointments },
    { name: "projectClients", fn: projectClients },
    { name: "projectRetention", fn: projectRetention },
    { name: "projectBehavior", fn: projectBehavior },
    { name: "projectLearning", fn: projectLearning },
  ];

  const errors: Array<{ projection: string; message: string }> = [];

  for (const proj of projections) {
    const projStart = Date.now();
    try {
      console.log(`[PROJECTION ORCHESTRATOR] Executando ${proj.name}...`);
      await proj.fn(sb, context);
      const projDuration = Date.now() - projStart;
      console.log(`[PROJECTION ORCHESTRATOR] Concluído ${proj.name} em ${projDuration}ms`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(`[PROJECTION ORCHESTRATOR] Erro em ${proj.name}: ${msg}`, err);
      errors.push({ projection: proj.name, message: msg });
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[PROJECTION ORCHESTRATOR] Ciclo concluído em ${durationMs}ms. Falhas: ${errors.length}`);

  if (errors.length > 0) {
    // Registra falhas na tabela de auditoria operacional do banco (sem lançar exceção para evitar rollback na V3)
    try {
      await sb.from("v3_audit_log").insert({
        import_id: context.importId,
        company_id: context.companyId,
        row_id: context.rowId,
        stage: "user_correction", // Usamos um estágio existente do enum do banco
        event: "PROJECTION_FAILED",
        input: { context } as any,
        output: { errors, durationMs } as any,
        reason: `Falha na publicação de efeitos: ${errors.map(e => `${e.projection}: ${e.message}`).join("; ")}`,
        responsavel: "Sistema",
        algorithm_version: "v3.0.0",
      } as any);
    } catch (auditErr) {
      console.error("[PROJECTION ORCHESTRATOR] Erro ao registrar auditoria de falha:", auditErr);
    }
  }

  return {
    success: errors.length === 0,
    durationMs,
    errors,
  };
}
