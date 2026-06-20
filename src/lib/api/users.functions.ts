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
      })
      .parse(input)
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
      throw new Error("Permissão negada. Apenas administradores e proprietários podem gerenciar usuários.");
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
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
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
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUserId,
        company_id: companyId,
        role: data.role,
      });

    if (roleError) {
      // Cleanup profile & auth user on failure
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(roleError.message);
    }

    // 5) If role is employee, register a professional record
    if (data.role === "employee") {
      const { error: profError } = await supabaseAdmin
        .from("professionals")
        .insert({
          company_id: companyId,
          user_id: newUserId,
          name: data.name,
          email: data.email.trim().toLowerCase(),
          active: true,
        });

      if (profError) {
        // Cleanup all
        await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId).eq("company_id", companyId);
        await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        throw new Error(profError.message);
      }
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
      .parse(input)
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
      throw new Error("Permissão negada. Apenas administradores e proprietários podem gerenciar usuários.");
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
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.targetUserId);

    await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", data.targetUserId);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (deleteError) {
      throw new Error(`Falha ao excluir o login de autenticação: ${deleteError.message}`);
    }

    return { ok: true };
  });
