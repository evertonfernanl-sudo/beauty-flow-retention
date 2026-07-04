import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectionContext } from "../ProjectionContext";

export async function projectClients(
  sb: SupabaseClient<Database>,
  context: ProjectionContext
): Promise<void> {
  const clientId = context.appliedResult.clientId;
  if (!clientId) return;

  // 1. Carregar todos os agendamentos COMPLETED deste cliente
  const { data: apps, error } = await sb
    .from("appointments")
    .select("price, start_datetime, service_id")
    .eq("client_id", clientId)
    .eq("status", "COMPLETED");

  if (error || !apps) return;

  const count = apps.length;
  const spent = apps.reduce((sum, item) => sum + Number(item.price ?? 0), 0);

  // Ordena para identificar a última visita
  const sorted = [...apps].sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  const latestVisit = sorted[sorted.length - 1];

  let lastVisitStr: string | null = null;
  let nextReturnStr: string | null = null;

  if (latestVisit) {
    lastVisitStr = latestVisit.start_datetime;

    let returnDays = 30;
    if (latestVisit.service_id) {
      const { data: svc } = await sb
        .from("services")
        .select("return_days")
        .eq("id", latestVisit.service_id)
        .maybeSingle();
      if (svc?.return_days != null) {
        returnDays = svc.return_days;
      }
    }

    const lastVisitDate = new Date(latestVisit.start_datetime);
    const nextReturnDate = new Date(lastVisitDate.getTime() + returnDays * 24 * 60 * 60 * 1000);
    nextReturnStr = nextReturnDate.toISOString().slice(0, 10);
  }

  // 2. Atualizar o cadastro acumulado do cliente (Naturalmente Idempotente por recalcular o todo)
  await sb
    .from("clients")
    .update({
      appointments_count: count,
      total_spent: spent,
      last_visit: lastVisitStr,
      next_return: nextReturnStr,
      status: "ACTIVE",
    })
    .eq("id", clientId);
}
