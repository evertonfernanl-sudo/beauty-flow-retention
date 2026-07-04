import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectionContext } from "../ProjectionContext";

export async function projectLearning(
  sb: SupabaseClient<Database>,
  context: ProjectionContext
): Promise<void> {
  const dateStr = context.canonicalData.transaction_date;
  const amount = Math.abs(context.canonicalData.amount ?? 0);
  const description = context.canonicalData.description || "";

  // 1. Idempotência: verificar se a transação operacional correspondente já existe
  const { data: tx } = await sb
    .from("financial_transactions")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("amount", amount)
    .eq("transaction_date", dateStr || "")
    .eq("description", description)
    .limit(1);

  if (tx && tx.length > 0) {
    return;
  }

  const serviceId = context.appliedResult.serviceId;
  
  // 2. Aprender padrões de valor e descrição (Heurísticas de IA)
  if (serviceId) {
    if (amount > 0) {
      await sb.rpc("learn_pattern", {
        _company_id: context.companyId,
        _type: "amount",
        _value: amount.toFixed(2),
        _entity_type: "service",
        _entity_id: serviceId,
        _label: undefined,
        _delta: 1,
      });
    }

    if (description) {
      await sb.rpc("learn_pattern", {
        _company_id: context.companyId,
        _type: "description",
        _value: description,
        _entity_type: "service",
        _entity_id: serviceId,
        _label: undefined,
        _delta: 1,
      });
    }
  }

  // 3. Aprender padrões do método de pagamento
  const method = context.canonicalData.movement_type;
  if (method) {
    await sb.rpc("learn_pattern", {
      _company_id: context.companyId,
      _type: "bank_description",
      _value: method,
      _entity_type: undefined,
      _entity_id: undefined,
      _label: undefined,
      _delta: 1,
    });
  }

  // 4. Recalcular comportamento de churn do cliente no banco
  const clientId = context.appliedResult.clientId;
  if (clientId) {
    await sb.rpc("refresh_client_behavior_profile", { _client_id: clientId });
  }
}
