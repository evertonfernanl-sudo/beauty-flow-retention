import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requestSystemResetCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Verify the current user is owner or admin of the company
    const { data: currentRoleRow } = await supabase
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!currentRoleRow || (currentRoleRow.role !== "owner" && currentRoleRow.role !== "admin")) {
      throw new Error(
        "Permissão negada. Apenas administradores e proprietários podem solicitar o reset do sistema.",
      );
    }

    const companyId = currentRoleRow.company_id;

    // 2) Get user's email from profiles
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("email, name")
      .eq("id", userId)
      .maybeSingle();

    if (!userProfile?.email) {
      throw new Error("E-mail do usuário não encontrado.");
    }

    const userEmail = userProfile.email;

    // 3) Generate 6-digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

    // 4) Upsert code into company_features under feature = 'system_reset'
    const { error: upsertError } = await supabaseAdmin.from("company_features").upsert(
      {
        company_id: companyId,
        feature: "system_reset",
        enabled: true,
        config: {
          code,
          expiresAt,
          email: userEmail,
        },
      },
      {
        onConflict: "company_id,feature",
      },
    );

    if (upsertError) {
      throw new Error(`Falha ao salvar código de segurança: ${upsertError.message}`);
    }

    // 5) Try to send email via Resend API
    let emailSent = false;
    let devMode = true;

    if (process.env.RESEND_API_KEY) {
      devMode = false;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "BeautyFlow <onboarding@resend.dev>",
            to: userEmail,
            subject: "Código de Segurança - Zerar Sistema BeautyFlow",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #ec4899; text-align: center;">Zerar Sistema BeautyFlow</h2>
                <p>Olá, <strong>${userProfile.name || "Administrador"}</strong>.</p>
                <p>Você solicitou a exclusão definitiva e o reset de todos os dados do seu sistema BeautyFlow.</p>
                <p>Para confirmar esta ação, insira o código de segurança de 6 dígitos abaixo no sistema:</p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; text-align: center; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; font-family: monospace; color: #1e293b;">${code}</span>
                </div>
                <p style="color: #64748b; font-size: 14px;">Este código é válido por <strong>15 minutos</strong>.</p>
                <p style="color: #ef4444; font-size: 14px; font-weight: bold; margin-top: 20px;">Atenção: Esta ação é irreversível e apagará todos os clientes, agendamentos, serviços, profissionais, lançamentos financeiros e outros dados.</p>
                <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">Se você não solicitou este reset, ignore este e-mail e altere sua senha de acesso imediatamente.</p>
              </div>
            `,
          }),
        });

        if (res.ok) {
          emailSent = true;
        } else {
          const errText = await res.text();
          console.error("Resend API response error:", errText);
        }
      } catch (err) {
        console.error("Failed to send email via Resend:", err);
      }
    }

    // Always log to console in dev mode or as fallback
    console.log(`\n--- [SECURITY RESET CODE] ---`);
    console.log(`Company ID: ${companyId}`);
    console.log(`User ID: ${userId} (${userEmail})`);
    console.log(`Verification Code: ${code}`);
    console.log(`Expires At: ${expiresAt}`);
    console.log(`-----------------------------\n`);

    return {
      ok: true,
      emailSent,
      devMode,
      code: devMode ? code : undefined,
    };
  });

export const verifyAndResetSystem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        code: z.string().trim().min(6).max(6),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Verify the current user is owner or admin of the company
    const { data: currentRoleRow } = await supabase
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!currentRoleRow || (currentRoleRow.role !== "owner" && currentRoleRow.role !== "admin")) {
      throw new Error(
        "Permissão negada. Apenas administradores e proprietários podem zerar o sistema.",
      );
    }

    const companyId = currentRoleRow.company_id;

    // 2) Get verification code configuration from company_features
    const { data: featureRow, error: featureError } = await supabaseAdmin
      .from("company_features")
      .select("config")
      .eq("company_id", companyId)
      .eq("feature", "system_reset")
      .maybeSingle();

    if (featureError || !featureRow) {
      throw new Error("Solicitação de reset não encontrada. Por favor, solicite um novo código.");
    }

    const config = featureRow.config as {
      code?: string;
      expiresAt?: string;
      email?: string;
    } | null;

    if (!config || !config.code || !config.expiresAt) {
      throw new Error("Configuração de segurança corrompida. Por favor, solicite um novo código.");
    }

    // 3) Validate code and expiration date
    if (config.code !== data.code) {
      throw new Error("Código de segurança incorreto.");
    }

    if (new Date(config.expiresAt) < new Date()) {
      throw new Error("Código de segurança expirado. Solicite um novo código.");
    }

    console.log(
      `[SYSTEM RESET] Commencing reset for company ${companyId} initiated by user ${userId}`,
    );

    // 4) Delete all transactional data for the company in dependency order

    // a) Financial Transactions
    await supabaseAdmin.from("financial_transactions").delete().eq("company_id", companyId);

    // b) Appointments
    await supabaseAdmin.from("appointments").delete().eq("company_id", companyId);

    // c) Return opportunities
    await supabaseAdmin.from("return_opportunities").delete().eq("company_id", companyId);

    // d) Recovery tasks and opportunities
    await supabaseAdmin.from("recovery_tasks").delete().eq("company_id", companyId);
    await supabaseAdmin.from("recovery_opportunities").delete().eq("company_id", companyId);

    // e) Client behavior profiles & contacts
    await supabaseAdmin.from("client_contacts").delete().eq("company_id", companyId);
    await supabaseAdmin.from("client_behavior_profiles").delete().eq("company_id", companyId);
    await supabaseAdmin.from("offering_behavior_profiles").delete().eq("company_id", companyId);
    await supabaseAdmin.from("payment_behavior_profiles").delete().eq("company_id", companyId);

    // f) Imports & Errors & Matches & Rows
    await supabaseAdmin.from("import_errors").delete().eq("company_id", companyId);
    await supabaseAdmin.from("import_matches").delete().eq("company_id", companyId);
    await supabaseAdmin.from("import_rows").delete().eq("company_id", companyId);
    await supabaseAdmin.from("import_knowledge_base").delete().eq("company_id", companyId);
    await supabaseAdmin.from("imports").delete().eq("company_id", companyId);

    // g) Campaigns & message queue & message logs & message templates
    await supabaseAdmin.from("campaigns").delete().eq("company_id", companyId);
    await supabaseAdmin.from("message_queue").delete().eq("company_id", companyId);
    await supabaseAdmin.from("message_logs").delete().eq("company_id", companyId);
    await supabaseAdmin.from("message_templates").delete().eq("company_id", companyId);

    // Seed back standard default templates
    await supabaseAdmin.from("message_templates").insert([
      {
        company_id: companyId,
        name: "Retorno padrão",
        type: "RETURN",
        channel: "WHATSAPP",
        body: "Olá {{primeiro_nome}}! Já está chegando o momento ideal para você voltar à {{empresa}}. Clique para escolher seu horário: {{link_agendamento}}",
        variables: ["primeiro_nome", "empresa", "link_agendamento"],
        is_default: true,
        active: true,
        cadence_offsets: [-7, -3, 0, 7],
        category: "retorno",
      },
      {
        company_id: companyId,
        name: "Reativação 90 dias",
        type: "REACTIVATION",
        channel: "WHATSAPP",
        body: "Olá {{primeiro_nome}}! Sentimos sua falta na {{empresa}}. Que tal voltar com uma condição especial? {{link_agendamento}}",
        variables: ["primeiro_nome", "empresa", "link_agendamento"],
        is_default: true,
        active: true,
        cadence_offsets: [0, 7, 15],
        category: "reativacao",
      },
    ]);

    // h) Notifications and audit logs
    await supabaseAdmin.from("notifications").delete().eq("company_id", companyId);
    await supabaseAdmin.from("audit_logs").delete().eq("company_id", companyId);

    // i) Clients
    await supabaseAdmin.from("clients").delete().eq("company_id", companyId);

    // j) Services
    await supabaseAdmin.from("services").delete().eq("company_id", companyId);

    // k) Professionals
    await supabaseAdmin.from("professionals").delete().eq("company_id", companyId);

    // l) Delete other profiles/roles and their auth.users (except the user doing the reset)
    const { data: otherProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .neq("id", userId);

    if (!fetchErr && otherProfiles && otherProfiles.length > 0) {
      for (const p of otherProfiles) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(p.id);
        } catch (e) {
          console.error(`[SYSTEM RESET] Failed to delete auth user ${p.id}:`, e);
          // If auth deletion fails, clean up from profiles & user_roles manually
          await supabaseAdmin.from("user_roles").delete().eq("user_id", p.id);
          await supabaseAdmin.from("profiles").delete().eq("id", p.id);
        }
      }
    }

    // 5) Clear transient verification code inside company_features
    await supabaseAdmin
      .from("company_features")
      .update({
        config: {},
      })
      .eq("company_id", companyId)
      .eq("feature", "system_reset");

    console.log(`[SYSTEM RESET] Finished reset for company ${companyId}`);

    return { ok: true };
  });
