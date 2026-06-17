import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonRecord = { [k: string]: JsonValue };

type ExportPayload = {
  exported_at: string;
  tables: { [table: string]: JsonRecord[] };
};

type ExportResult =
  | { ok: true; data: ExportPayload }
  | { ok: false; error: string };

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };



// LGPD — Export all data the current user's company owns.
export const exportMyCompanyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExportResult> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    const companyId = profile?.company_id ?? null;
    if (!companyId) {
      return { ok: false, error: "Sem empresa associada" };
    }

    const tables = [
      "companies",
      "clients",
      "services",
      "appointments",
      "financial_transactions",
      "recovery_opportunities",
      "recovery_tasks",
      "return_opportunities",
      "client_contacts",
    ] as const;

    const out: { [table: string]: JsonRecord[] } = {};
    for (const t of tables) {
      const { data } = await supabase
        .from(t as never)
        .select("*")
        .eq("company_id", companyId);
      out[t] = ((data ?? []) as unknown as JsonRecord[]);
    }

    return {
      ok: true,
      data: { exported_at: new Date().toISOString(), tables: out },
    };
  });

// LGPD — Request account/company deletion.
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActionResult> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    const companyId = profile?.company_id ?? null;
    if (!companyId) return { ok: false, error: "Sem empresa associada" };

    const { data: isOwner } = await supabase.rpc("has_role", {
      _user_id: userId,
      _company_id: companyId,
      _role: "owner",
    });
    if (!isOwner) {
      return { ok: false, error: "Apenas o proprietário pode solicitar exclusão" };
    }

    await supabase.from("audit_logs").insert({
      company_id: companyId,
      user_id: userId,
      action: "account_deletion_requested",
      entity: "companies",
      entity_id: companyId,
    });

    return {
      ok: true,
      message: "Solicitação registrada. Sua conta será excluída em até 30 dias.",
    };
  });
