import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CampaignPayload = z.object({
  name: z.string().trim().min(1).max(120),
  segment: z.string().trim().min(1).max(40),
  template_id: z.string().uuid().nullable().optional(),
  message_body: z.string().trim().min(1).max(4000),
  sent_count: z.number().int().min(0).max(100_000),
});

// Enqueue a campaign record job. Worker writes the row using service_role.
// Frontend keeps the wa.me window.open loop (real WhatsApp API plugs here later).
export const enqueueCampaignRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CampaignPayload.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");

    const { data: jobId, error } = await supabase.rpc("enqueue_job", {
      _company_id: profile.company_id,
      _type: "campaign.record",
      _payload: data as never,
      _priority: 5,
    });
    if (error) throw new Error(error.message);
    return { jobId: jobId as string };
  });
