import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectionContext } from "../ProjectionContext";

export async function projectBehavior(
  sb: SupabaseClient<Database>,
  context: ProjectionContext
): Promise<void> {
  const method = context.canonicalData.movement_type;
  if (!method) return;

  const dateStr = context.canonicalData.transaction_date;
  const amount = Math.abs(context.canonicalData.amount ?? 0);
  const description = context.canonicalData.description || "";

  // 1. Idempotência: verificar se a transação operacional legada correspondente já existe
  const { data: tx } = await sb
    .from("financial_transactions")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("amount", amount)
    .eq("transaction_date", dateStr || "")
    .eq("description", description)
    .limit(1);

  if (tx && tx.length > 0) {
    // Se a transação correspondente já existe, as projeções deste ciclo já foram executadas
    return;
  }

  // 2. Incrementar hits ou inserir registro de comportamento de pagamento
  const { data: current } = await sb
    .from("payment_behavior_profiles")
    .select("hits")
    .eq("company_id", context.companyId)
    .eq("payment_method", method)
    .maybeSingle();

  if (current) {
    await sb
      .from("payment_behavior_profiles")
      .update({ hits: (current.hits ?? 0) + 1 })
      .eq("company_id", context.companyId)
      .eq("payment_method", method);
  } else {
    await sb
      .from("payment_behavior_profiles")
      .insert({
        company_id: context.companyId,
        payment_method: method,
        hits: 1,
      });
  }
}
