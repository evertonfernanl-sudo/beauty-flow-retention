import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectionContext } from "../ProjectionContext";

export async function projectRetention(
  sb: SupabaseClient<Database>,
  context: ProjectionContext
): Promise<void> {
  const clientId = context.appliedResult.clientId;
  if (!clientId || context.suggestions.type !== "INCOME") return;

  const dateStr = context.canonicalData.transaction_date;
  if (!dateStr) return;

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
  if (!serviceId) return;

  // Carregar return_days e preço do serviço
  const { data: svc } = await sb
    .from("services")
    .select("return_days, price")
    .eq("id", serviceId)
    .single();

  const returnDays = svc?.return_days ?? 30;
  const price = svc?.price ?? Math.abs(context.canonicalData.amount ?? 0);

  const lastVisitDate = new Date(`${dateStr}T12:00:00.000Z`);
  const expectedReturnDate = new Date(lastVisitDate.getTime() + returnDays * 24 * 60 * 60 * 1000);
  const expectedReturnStr = expectedReturnDate.toISOString().slice(0, 10);

  // 1. Verificar idempotência: evitar duplicidade de oportunidade no mesmo dia esperado e serviço
  const { data: existing } = await sb
    .from("return_opportunities")
    .select("id")
    .eq("client_id", clientId)
    .eq("service_id", serviceId)
    .eq("expected_return_date", expectedReturnStr)
    .limit(1);

  if (existing && existing.length > 0) {
    return;
  }

  // 2. Inserir oportunidade de retenção
  await sb.from("return_opportunities").insert({
    company_id: context.companyId,
    client_id: clientId,
    service_id: serviceId,
    expected_return_date: expectedReturnStr,
    estimated_value: price,
    status: "ON_TIME",
  });
}
