import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        reason: z.string().min(2, "Motivo é obrigatório"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Verify the current user is owner of the company
    const { data: currentRoleRow } = await supabase
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!currentRoleRow || currentRoleRow.role !== "owner") {
      throw new Error("Permissão negada. Apenas proprietários podem cancelar a assinatura.");
    }

    const companyId = currentRoleRow.company_id;

    // 2) Update subscription to CANCELED status
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "CANCELED",
        canceled_at: new Date().toISOString(),
        cancellation_reason: data.reason,
      })
      .eq("company_id", companyId);

    if (error) {
      throw new Error(`Falha ao cancelar a assinatura: ${error.message}`);
    }

    return { ok: true };
  });
