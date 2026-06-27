import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MergeInput = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

export const mergeClientsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => MergeInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Get user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.company_id) {
      throw new Error("Empresa não encontrada");
    }
    const companyId = profile.company_id;

    // Validate that both clients belong to this company
    const { data: sourceClient, error: sourceErr } = await supabaseAdmin
      .from("clients")
      .select("company_id")
      .eq("id", data.sourceId)
      .maybeSingle();

    const { data: targetClient, error: targetErr } = await supabaseAdmin
      .from("clients")
      .select("company_id")
      .eq("id", data.targetId)
      .maybeSingle();

    if (sourceErr || !sourceClient || targetErr || !targetClient) {
      throw new Error("Um ou ambos os clientes não foram encontrados.");
    }

    if (sourceClient.company_id !== companyId || targetClient.company_id !== companyId) {
      throw new Error("Acesso negado: os clientes devem pertencer à mesma empresa do usuário.");
    }

    // Update appointments
    const { error: apptErr } = await supabaseAdmin
      .from("appointments")
      .update({ client_id: data.targetId })
      .eq("client_id", data.sourceId);
    if (apptErr) throw new Error("Erro ao atualizar agendamentos: " + apptErr.message);

    // Update message_logs
    const { error: msgLogsErr } = await supabaseAdmin
      .from("message_logs")
      .update({ client_id: data.targetId })
      .eq("client_id", data.sourceId);
    if (msgLogsErr) throw new Error("Erro ao atualizar histórico de mensagens: " + msgLogsErr.message);

    // Update message_queue
    const { error: msgQueueErr } = await supabaseAdmin
      .from("message_queue")
      .update({ client_id: data.targetId })
      .eq("client_id", data.sourceId);
    if (msgQueueErr) throw new Error("Erro ao atualizar fila de mensagens: " + msgQueueErr.message);

    // Update recovery_opportunities
    const { error: recOppErr } = await supabaseAdmin
      .from("recovery_opportunities")
      .update({ client_id: data.targetId })
      .eq("client_id", data.sourceId);
    if (recOppErr) throw new Error("Erro ao atualizar oportunidades: " + recOppErr.message);

    // Update import_rows
    const { error: impRowsErr } = await supabaseAdmin
      .from("import_rows")
      .update({ resolved_client_id: data.targetId })
      .eq("resolved_client_id", data.sourceId);
    if (impRowsErr) throw new Error("Erro ao atualizar linhas de importação: " + impRowsErr.message);

    // Update providers (only if table exists in the database)
    const { error: provErr } = await supabaseAdmin
      .from("providers")
      .update({ client_id: data.targetId })
      .eq("client_id", data.sourceId);
    if (provErr) {
      const isMissingTable =
        provErr.message?.includes("Could not find the table") ||
        provErr.code === "PGRST104" ||
        provErr.code === "42P01";
      if (!isMissingTable) {
        throw new Error("Erro ao atualizar prestadores: " + provErr.message);
      }
    }

    // Delete the duplicate source client
    const { error: delErr } = await supabaseAdmin
      .from("clients")
      .delete()
      .eq("id", data.sourceId);
    if (delErr) throw new Error("Erro ao remover cadastro duplicado: " + delErr.message);

    return { success: true };
  });
