import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// LGPD — Export all data the current user's company owns.
export const exportMyCompanyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    const companyId = profile?.company_id;
    if (!companyId) {
      return { ok: false as const, error: "Sem empresa associada" };
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

    const payload: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const t of tables) {
      const { data } = await supabase.from(t).select("*").eq("company_id", companyId);
      payload[t] = data ?? [];
    }
    return { ok: true as const, data: payload };
  });

// LGPD — Request account/company deletion.
// Marks the company as scheduled for deletion; admin worker performs hard delete after retention window.
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    const companyId = profile?.company_id;
    if (!companyId) return { ok: false as const, error: "Sem empresa associada" };

    // Only owners can request company deletion
    const { data: isOwner } = await supabase.rpc("has_role", {
      _user_id: userId,
      _company_id: companyId,
      _role: "owner",
    });
    if (!isOwner) {
      return { ok: false as const, error: "Apenas o proprietário pode solicitar exclusão" };
    }

    await supabase.from("audit_logs").insert({
      company_id: companyId,
      user_id: userId,
      action: "account_deletion_requested",
      entity: "companies",
      entity_id: companyId,
    });

    return { ok: true as const, message: "Solicitação registrada. Sua conta será excluída em até 30 dias." };
  });
