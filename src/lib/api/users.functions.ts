import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createProfessionalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(120),
        email: z.string().trim().email("E-mail inválido").max(255),
        password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").max(72),
        role: z.enum(["admin", "employee"]),
        permissions: z.record(z.string(), z.boolean()).optional(),
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
        "Permissão negada. Apenas administradores e proprietários podem gerenciar usuários.",
      );
    }

    const companyId = currentRoleRow.company_id;

    // 2) Create the auth user via admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "Falha ao criar credenciais do usuário.");
    }

    const newUserId = authData.user.id;

    // 3) Create user profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      company_id: companyId,
      name: data.name,
      email: data.email.trim().toLowerCase(),
    });

    if (profileError) {
      // Cleanup auth user on failure
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(profileError.message);
    }

    // 4) Assign company role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      company_id: companyId,
      role: data.role,
      permissions: data.permissions ?? {},
    });

    if (roleError) {
      // Cleanup profile & auth user on failure
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(roleError.message);
    }

    return { ok: true, userId: newUserId };
  });

export const deleteCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetUserId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Verify the current user is owner or admin
    const { data: currentRoleRow } = await supabase
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!currentRoleRow || (currentRoleRow.role !== "owner" && currentRoleRow.role !== "admin")) {
      throw new Error(
        "Permissão negada. Apenas administradores e proprietários podem gerenciar usuários.",
      );
    }

    const companyId = currentRoleRow.company_id;

    // Prevent self-deletion
    if (userId === data.targetUserId) {
      throw new Error("Você não pode excluir sua própria conta.");
    }

    // Verify target belongs to the same company
    const { data: targetRoleRow } = await supabase
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", data.targetUserId)
      .maybeSingle();

    if (!targetRoleRow || targetRoleRow.company_id !== companyId) {
      throw new Error("O usuário não pertence a sua empresa.");
    }

    const { data: companyRow } = await supabaseAdmin
      .from("companies")
      .select("email")
      .eq("id", companyId)
      .maybeSingle();

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.targetUserId)
      .maybeSingle();

    const isTargetOwner =
      targetRoleRow.role === "owner" ||
      (companyRow?.email && targetProfile?.email?.toLowerCase() === companyRow.email.toLowerCase());

    if (isTargetOwner) {
      throw new Error("O proprietário da empresa não pode ser excluído.");
    }

    // 2) Delete associated professional record if any
    await supabaseAdmin
      .from("professionals")
      .delete()
      .eq("user_id", data.targetUserId)
      .eq("company_id", companyId);

    // 3) Delete role, profile, and auth user
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);

    await supabaseAdmin.from("profiles").delete().eq("id", data.targetUserId);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (deleteError) {
      throw new Error(`Falha ao excluir o login de autenticação: ${deleteError.message}`);
    }

    return { ok: true };
  });

export const updateUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        permissions: z.record(z.string(), z.boolean()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Verify the current user is owner or admin
    const { data: currentRoleRow } = await supabase
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!currentRoleRow || (currentRoleRow.role !== "owner" && currentRoleRow.role !== "admin")) {
      throw new Error(
        "Permissão negada. Apenas administradores e proprietários podem gerenciar usuários.",
      );
    }

    const companyId = currentRoleRow.company_id;

    // Verify target belongs to the same company
    const { data: targetRoleRow } = await supabase
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", data.targetUserId)
      .maybeSingle();

    if (!targetRoleRow || targetRoleRow.company_id !== companyId) {
      throw new Error("O usuário não pertence a sua empresa.");
    }

    const { data: companyRow } = await supabaseAdmin
      .from("companies")
      .select("email")
      .eq("id", companyId)
      .maybeSingle();

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.targetUserId)
      .maybeSingle();

    const isTargetOwner =
      targetRoleRow.role === "owner" ||
      (companyRow?.email && targetProfile?.email?.toLowerCase() === companyRow.email.toLowerCase());

    if (isTargetOwner) {
      throw new Error("As permissões do proprietário não podem ser alteradas.");
    }

    // 2) Update permissions in user_roles
    const { error: updateError } = await supabaseAdmin
      .from("user_roles")
      .update({
        permissions: data.permissions,
      })
      .eq("user_id", data.targetUserId)
      .eq("company_id", companyId);

    if (updateError) {
      throw new Error(`Falha ao atualizar permissões: ${updateError.message}`);
    }

    return { ok: true };
  });

export const runAdminJobsTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Verify platform admin access
    const { data: adminCheck } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!adminCheck)
      throw new Error("Acesso negado. Apenas administradores da plataforma podem rodar o worker.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runWorker } = await import("@/lib/api/worker.server");

    try {
      const processed = await runWorker(supabaseAdmin);
      return { ok: true, count: processed.length, processed };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  });

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Verify platform admin access
    const { data: adminCheck } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!adminCheck) {
      throw new Error("Acesso negado. Apenas administradores da plataforma podem listar usuários.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch all profiles
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, created_at, active, company_id, companies(name)")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Erro ao listar perfis: ${error.message}`);
    }

    // Fetch roles
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");

    const roleMap = new Map(roles?.map((r) => [r.user_id, r.role]) ?? []);

    return (profiles ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      created_at: p.created_at,
      active: p.active,
      company_name: p.companies?.name ?? "Nenhuma",
      role: roleMap.get(p.id) ?? "employee",
    }));
  });

export const resetPlatformUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetUserId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Verify the current user is a platform admin
    const { data: adminCheck } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!adminCheck) {
      throw new Error("Acesso negado. Apenas administradores da plataforma podem resetar senhas.");
    }

    // 2) Fetch user email to make sure user exists
    const { data: targetProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("email, name")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (profileErr || !targetProfile) {
      throw new Error("Usuário não encontrado.");
    }

    // Generate a secure temporary password
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let tempPassword = "BF-";
    for (let i = 0; i < 8; i++) {
      if (i === 4) tempPassword += "-";
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // 3) Update the auth user's password and metadata via admin API
    const { data: authData, error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      data.targetUserId,
      {
        password: tempPassword,
        user_metadata: {
          password_reset_required: true,
        },
      },
    );

    if (authUpdateError) {
      throw new Error(`Falha ao atualizar a senha no Supabase Auth: ${authUpdateError.message}`);
    }

    // 4) Generate a recovery link
    const redirectToUrl = `${process.env.APP_URL || "http://localhost:5173"}/reset-password`;
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: targetProfile.email,
      options: {
        redirectTo: redirectToUrl,
      },
    });

    const recoveryLink = linkError ? null : linkData.properties?.action_link;

    return {
      ok: true,
      tempPassword,
      recoveryLink,
    };
  });

