import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectionContext } from "../ProjectionContext";

export async function projectAppointments(
  sb: SupabaseClient<Database>,
  context: ProjectionContext
): Promise<void> {
  const clientId = context.appliedResult.clientId;
  if (!clientId || context.suggestions.type !== "INCOME") {
    // Apenas receitas com clientes associados geram atendimentos na agenda
    return;
  }

  const amount = Math.abs(context.canonicalData.amount ?? 0);
  const dateStr = context.canonicalData.transaction_date;
  if (!dateStr || amount <= 0) return;

  const startOfDay = `${dateStr}T00:00:00.000Z`;
  const endOfDay = `${dateStr}T23:59:59.999Z`;

  // 1. Verificar idempotência: buscar se já existe agendamento equivalente
  const { data: existing } = await sb
    .from("appointments")
    .select("id, status")
    .eq("company_id", context.companyId)
    .eq("client_id", clientId)
    .eq("price", amount)
    .gte("start_datetime", startOfDay)
    .lte("start_datetime", endOfDay)
    .limit(1);

  let serviceId = context.appliedResult.serviceId;
  if (!serviceId) {
    const { data: fallbackService } = await sb
      .from("services")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    serviceId = fallbackService?.id ?? null;
  }

  const startDatetime = `${dateStr}T09:00:00.000Z`;
  const endDatetime = `${dateStr}T10:00:00.000Z`;
  const notes = context.canonicalData.description || "Atendimento importado (V3)";

  if (existing && existing.length > 0) {
    const app = existing[0];
    if (app.status !== "COMPLETED") {
      // Atualiza para garantir compatibilidade funcional e status operacional correto
      await sb
        .from("appointments")
        .update({
          status: "COMPLETED",
          source: "ADMIN",
          completed_at: startDatetime,
          notes,
          service_id: serviceId || undefined,
        })
        .eq("id", app.id);
    }
    return;
  }

  // Se não houver serviço ativo, cria um padrão (equivalente ao worker legado)
  if (!serviceId) {
    const { data: newSvc, error: svcErr } = await sb
      .from("services")
      .insert({
        company_id: context.companyId,
        name: "Atendimento Importado",
        duration_minutes: 60,
        price: amount,
        return_days: 30,
        active: true,
      })
      .select("id")
      .single();
    if (!svcErr && newSvc) {
      serviceId = newSvc.id;
    }
  }

  // 2. Inserir agendamento com status operacional COMPLETED
  await sb.from("appointments").insert({
    company_id: context.companyId,
    client_id: clientId,
    service_id: serviceId,
    start_datetime: startDatetime,
    end_datetime: endDatetime,
    status: "COMPLETED",
    price: amount,
    source: "ADMIN",
    completed_at: startDatetime,
    notes,
  });
}
