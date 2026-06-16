import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_SERVICES = [
  { name: "Design de Sobrancelhas", duration_minutes: 30, price: 50, return_days: 30 },
  { name: "Design com Henna", duration_minutes: 45, price: 70, return_days: 25 },
  { name: "Lash Volume Brasileiro", duration_minutes: 90, price: 150, return_days: 21 },
  { name: "Manicure", duration_minutes: 45, price: 40, return_days: 15 },
  { name: "Pedicure", duration_minutes: 60, price: 50, return_days: 30 },
];

export const createCompanyForCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(40).optional().nullable(),
        ownerName: z.string().trim().min(2).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims.email as string) ?? "";

    // Idempotent: if profile already has a company, return it
    const { data: existing } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (existing?.company_id) {
      return { companyId: existing.company_id, alreadyExisted: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name: data.name, phone: data.phone ?? null, email, plan: "starter" })
      .select("id")
      .single();
    if (companyError || !company) throw new Error(companyError?.message ?? "Falha ao criar empresa");

    // Upsert profile linked to company
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        company_id: company.id,
        name: data.ownerName,
        email,
      });
    if (profileError) throw new Error(profileError.message);

    // Grant owner role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, company_id: company.id, role: "owner" });
    if (roleError) throw new Error(roleError.message);

    return { companyId: company.id, alreadyExisted: false };
  });

export const seedDefaultServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");

    const { count } = await supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.company_id);
    if ((count ?? 0) > 0) return { inserted: 0 };

    const companyId = profile.company_id as string;
    const rows = DEFAULT_SERVICES.map((s) => ({ ...s, company_id: companyId }));
    const { error } = await supabase.from("services").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");
    const { error } = await supabase
      .from("companies")
      .update({ onboarding_completed: true })
      .eq("id", profile.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
