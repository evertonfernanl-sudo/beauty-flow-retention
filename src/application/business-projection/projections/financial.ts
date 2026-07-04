import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectionContext } from "../ProjectionContext";

export async function projectFinancial(
  sb: SupabaseClient<Database>,
  context: ProjectionContext
): Promise<void> {
  const amount = Math.abs(context.canonicalData.amount ?? 0);
  const dateStr = context.canonicalData.transaction_date;
  if (!dateStr || amount <= 0) return;

  const type = context.suggestions.type;
  if (!type) return;

  const description = context.canonicalData.description || (type === "EXPENSE" ? "Despesa automática" : "Receita automática");
  
  // 1. Verificar idempotência: evitar duplicados na tabela legada
  const { data: existing } = await sb
    .from("financial_transactions")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("type", type)
    .eq("amount", amount)
    .eq("transaction_date", dateStr)
    .eq("description", description)
    .limit(1);

  if (existing && existing.length > 0) {
    // Transação idêntica já existe, confirma consistência e retorna
    return;
  }

  let appointmentId: string | null = null;
  let providerId: string | null = null;
  let category = "Importação";

  if (type === "INCOME") {
    const subtype = context.suggestions.subtype;
    if (subtype === "APORTE") {
      category = "Aporte";
    } else {
      // Receita vinculada ao atendimento operacional
      const clientId = context.appliedResult.clientId;
      if (clientId) {
        const startOfDay = `${dateStr}T00:00:00.000Z`;
        const endOfDay = `${dateStr}T23:59:59.999Z`;
        const { data: app } = await sb
          .from("appointments")
          .select("id")
          .eq("company_id", context.companyId)
          .eq("client_id", clientId)
          .eq("price", amount)
          .gte("start_datetime", startOfDay)
          .lte("start_datetime", endOfDay)
          .limit(1);
        if (app && app.length > 0) {
          appointmentId = app[0].id;
        }
      }
    }
  } else {
    // EXPENSE
    const subtype = context.suggestions.subtype;
    category = subtype === "DESPESA_PESSOAL" ? "Despesa Pessoal" : "Despesa Empresa";

    const isBankFee = context.suggestions.isBankFee || context.suggestions.isBankInterest;
    if (isBankFee) {
      // Buscar metadata do import para inferir nome do banco
      const { data: imp } = await sb
        .from("v3_imports")
        .select("filename")
        .eq("id", context.importId)
        .single();
      const bankName = inferBankName(imp?.filename, description);
      
      const { data: existingProv } = await sb
        .from("providers")
        .select("id")
        .eq("company_id", context.companyId)
        .eq("name", bankName)
        .limit(1);

      if (existingProv && existingProv.length > 0) {
        providerId = existingProv[0].id;
      } else {
        const { data: newProv } = await sb
          .from("providers")
          .insert({ company_id: context.companyId, name: bankName })
          .select("id")
          .single();
        if (newProv) {
          providerId = newProv.id;
        }
      }
    }
  }

  // 2. Inserir a transação financeira operacional legada
  await sb.from("financial_transactions").insert({
    company_id: context.companyId,
    type,
    category,
    description,
    amount,
    transaction_date: dateStr,
    appointment_id: appointmentId,
    provider_id: providerId,
    payment_method: context.canonicalData.movement_type || null,
  });
}

function inferBankName(filename?: string | null, desc?: string | null): string {
  const f = (filename || "").toLowerCase();
  const d = (desc || "").toLowerCase();
  if (f.includes("itau") || d.includes("itau")) return "Itaú";
  if (f.includes("bradesco") || d.includes("bradesco")) return "Bradesco";
  if (f.includes("santander") || d.includes("santander")) return "Santander";
  if (f.includes("brasil") || f.includes("bb") || d.includes("bb") || d.includes("brasil")) return "Banco do Brasil";
  if (f.includes("nubank") || d.includes("nubank") || d.includes("nu pagamentos")) return "Nubank";
  if (f.includes("inter") || d.includes("inter")) return "Banco Inter";
  if (f.includes("caixa") || d.includes("cef") || d.includes("caixa")) return "Caixa Econômica";
  if (f.includes("sicredi") || d.includes("sicredi")) return "Sicredi";
  if (f.includes("sicoob") || d.includes("sicoob")) return "Sicoob";
  return "Outro Banco";
}
