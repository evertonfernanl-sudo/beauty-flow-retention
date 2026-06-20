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

    if (targetRoleRow.role === "owner") {
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

    if (targetRoleRow.role === "owner") {
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
      
    if (!adminCheck) throw new Error("Acesso negado. Apenas administradores da plataforma podem rodar o worker.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runWorker } = await import("@/lib/api/worker.server");

    try {
      const processed = await runWorker(supabaseAdmin);
      return { ok: true, count: processed.length, processed };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  });
