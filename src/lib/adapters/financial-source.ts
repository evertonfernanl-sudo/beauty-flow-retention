// Adaptador de leituras financeiras — desacopla telas de origem (V2 / V3 / futuras).
// As telas (Agenda, Dashboard, Recorrência, Clientes) consomem APENAS este módulo.
import { supabase } from "@/integrations/supabase/client";

export type FinancialEntry = {
  id: string;
  company_id: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  transaction_date: string;
  description: string;
  client_id: string | null;
  service_id: string | null;
  source_engine: "v2" | "v3";
  is_personal?: boolean;
  revenue_type?: string | null;
  category?: string | null;
};

export async function listFinancial(opts: {
  companyId: string;
  from?: string;
  to?: string;
  includeEngines?: Array<"v2" | "v3">;
}): Promise<FinancialEntry[]> {
  const engines = opts.includeEngines ?? ["v2", "v3"];
  const out: FinancialEntry[] = [];

  if (engines.includes("v3")) {
    let q = supabase.from("v3_financial_transactions").select("*").eq("company_id", opts.companyId);
    if (opts.from) q = q.gte("transaction_date", opts.from);
    if (opts.to) q = q.lte("transaction_date", opts.to);
    const { data } = await q;
    for (const r of data ?? []) {
      out.push({
        id: r.id, company_id: r.company_id, type: r.type as "INCOME" | "EXPENSE",
        amount: Number(r.amount), transaction_date: r.transaction_date,
        description: r.description, client_id: r.client_id, service_id: r.service_id,
        source_engine: "v3", is_personal: r.is_personal, revenue_type: r.revenue_type,
        category: r.category,
      });
    }
  }

  if (engines.includes("v2")) {
    let q = supabase.from("financial_transactions").select("*").eq("company_id", opts.companyId);
    if (opts.from) q = q.gte("transaction_date", opts.from);
    if (opts.to) q = q.lte("transaction_date", opts.to);
    const { data } = await q;
    for (const r of (data ?? []) as any[]) {
      out.push({
        id: r.id, company_id: r.company_id, type: r.type,
        amount: Number(r.amount), transaction_date: r.transaction_date,
        description: r.description ?? "", client_id: r.client_id ?? null,
        service_id: r.service_id ?? null, source_engine: "v2",
        is_personal: r.is_personal, revenue_type: r.revenue_type, category: r.category,
      });
    }
  }

  return out.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
}
