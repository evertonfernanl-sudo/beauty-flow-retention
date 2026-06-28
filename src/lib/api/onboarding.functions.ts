import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toStoragePhone } from "@/lib/phone";

type Vertical = "BEAUTY" | "SALES" | "GYM" | "SERVICE" | "FINANCE";

type Offering = {
  name: string;
  kind: "SERVICE" | "PRODUCT" | "PLAN";
  duration_minutes: number;
  price: number;
  return_days: number;
  billing_cycle_days?: number;
};

const SEEDS: Record<Vertical, Offering[]> = {
  BEAUTY: [
    {
      name: "Design de Sobrancelhas",
      kind: "SERVICE",
      duration_minutes: 30,
      price: 50,
      return_days: 30,
    },
    { name: "Design com Henna", kind: "SERVICE", duration_minutes: 45, price: 70, return_days: 25 },
    {
      name: "Lash Volume Brasileiro",
      kind: "SERVICE",
      duration_minutes: 90,
      price: 150,
      return_days: 21,
    },
    { name: "Manicure", kind: "SERVICE", duration_minutes: 45, price: 40, return_days: 15 },
    { name: "Pedicure", kind: "SERVICE", duration_minutes: 60, price: 50, return_days: 30 },
  ],
  SALES: [
    { name: "Perfume 100ml", kind: "PRODUCT", duration_minutes: 0, price: 199, return_days: 45 },
    {
      name: "Hidratante Corporal",
      kind: "PRODUCT",
      duration_minutes: 0,
      price: 59,
      return_days: 30,
    },
    { name: "Sérum Facial", kind: "PRODUCT", duration_minutes: 0, price: 89, return_days: 60 },
    { name: "Kit Skincare", kind: "PRODUCT", duration_minutes: 0, price: 249, return_days: 75 },
    { name: "Batom Matte", kind: "PRODUCT", duration_minutes: 0, price: 39, return_days: 60 },
  ],
  GYM: [
    {
      name: "Mensal",
      kind: "PLAN",
      duration_minutes: 0,
      price: 99,
      return_days: 30,
      billing_cycle_days: 30,
    },
    {
      name: "Trimestral",
      kind: "PLAN",
      duration_minutes: 0,
      price: 270,
      return_days: 90,
      billing_cycle_days: 90,
    },
    {
      name: "Semestral",
      kind: "PLAN",
      duration_minutes: 0,
      price: 500,
      return_days: 180,
      billing_cycle_days: 180,
    },
    {
      name: "Anual",
      kind: "PLAN",
      duration_minutes: 0,
      price: 900,
      return_days: 365,
      billing_cycle_days: 365,
    },
  ],
  SERVICE: [
    {
      name: "Consultoria Geral",
      kind: "SERVICE",
      duration_minutes: 60,
      price: 150,
      return_days: 30,
    },
    {
      name: "Atendimento Técnico",
      kind: "SERVICE",
      duration_minutes: 90,
      price: 200,
      return_days: 90,
    },
    {
      name: "Suporte Especializado",
      kind: "SERVICE",
      duration_minutes: 45,
      price: 120,
      return_days: 30,
    },
  ],
  FINANCE: [
    {
      name: "Planejamento Financeiro",
      kind: "SERVICE",
      duration_minutes: 60,
      price: 250,
      return_days: 90,
    },
    {
      name: "Análise de Investimentos",
      kind: "SERVICE",
      duration_minutes: 60,
      price: 300,
      return_days: 60,
    },
    {
      name: "Assessoria de Orçamento",
      kind: "SERVICE",
      duration_minutes: 45,
      price: 180,
      return_days: 30,
    },
  ],
};

export const createCompanyForCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(40).optional().nullable(),
        ownerName: z.string().trim().min(2).max(120),
        vertical: z.enum(["BEAUTY", "SALES", "GYM", "SERVICE", "FINANCE"]).default("BEAUTY"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims.email as string) ?? "";

    const { data: existing } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (existing?.company_id) {
      return { companyId: existing.company_id, alreadyExisted: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: data.name,
        phone: toStoragePhone(data.phone ?? "") ?? null,
        email,
        plan: "starter",
        vertical: data.vertical,
      })
      .select("id")
      .single();
    if (companyError || !company)
      throw new Error(companyError?.message ?? "Falha ao criar empresa");

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, company_id: company.id, name: data.ownerName, email });
    if (profileError) throw new Error(profileError.message);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, company_id: company.id, role: "owner" });
    if (roleError) throw new Error(roleError.message);

    return { companyId: company.id, alreadyExisted: false };
  });

export const setCompanyVertical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ vertical: z.enum(["BEAUTY", "SALES", "GYM", "SERVICE", "FINANCE"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");
    const { error } = await supabase
      .from("companies")
      .update({ vertical: data.vertical })
      .eq("id", profile.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
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

    const { data: company } = await supabase
      .from("companies")
      .select("vertical")
      .eq("id", profile.company_id)
      .maybeSingle();
    const vertical = (company?.vertical ?? "BEAUTY") as Vertical;

    const { count } = await supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.company_id);
    if ((count ?? 0) > 0) return { inserted: 0 };

    const rows = SEEDS[vertical].map((s) => ({ ...s, company_id: profile.company_id as string }));
    const { error } = await supabase.from("services").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const addProfessionals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        professionals: z
          .array(
            z.object({
              name: z.string().trim().min(2).max(120),
              specialty: z.string().trim().max(120).optional().or(z.literal("")),
              phone: z.string().trim().max(40).optional().or(z.literal("")),
            }),
          )
          .max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");

    const rows = data.professionals
      .filter((p) => p.name.trim().length >= 2)
      .map((p) => ({
        company_id: profile.company_id as string,
        name: p.name.trim(),
        specialty: p.specialty?.trim() || null,
        phone: p.phone ? toStoragePhone(p.phone) : null,
      }));
    if (rows.length === 0) return { inserted: 0 };
    const { error } = await supabase.from("professionals").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const updateWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
        template: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");
    const { error } = await supabase
      .from("companies")
      .update({
        whatsapp: data.whatsapp ? toStoragePhone(data.whatsapp) : null,
        whatsapp_template: data.template || null,
      })
      .eq("id", profile.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
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

export const registerCardAndPayInitial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        holderName: z.string().trim().min(3, "Nome do titular inválido"),
        cardNumber: z.string().trim().min(13, "Número do cartão inválido").max(19),
        expiry: z.string().trim().min(5, "Validade inválida (MM/AA)"),
        cvv: z.string().trim().min(3, "CVV inválido").max(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Find user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.company_id) {
      throw new Error("Empresa não encontrada. Complete o passo inicial.");
    }

    const companyId = profile.company_id;

    // Get current subscription
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!subscription) {
      throw new Error("Assinatura não cadastrada no sistema. Contate o suporte.");
    }

    // 2) Generate a transaction invoice of R$ 0,01
    const invoiceNumber = `BF-${Math.floor(100000 + Math.random() * 900000)}`;

    const { error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .insert({
        company_id: companyId,
        subscription_id: subscription.id,
        number: invoiceNumber,
        amount: 0.01,
        status: "PAID",
        due_date: new Date().toISOString().split("T")[0],
        paid_at: new Date().toISOString(),
        gateway: "MOCK_GATEWAY",
        gateway_invoice_id: `gtw_${Math.random().toString(36).substr(2, 9)}`,
      });

    if (invoiceError) {
      throw new Error(`Falha ao registrar fatura inicial de R$ 0,01: ${invoiceError.message}`);
    }

    // 3) Update subscription status to ACTIVE and amount to 0.01
    const { error: subError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "ACTIVE",
        amount: 0.01,
        gateway: "MOCK_GATEWAY",
        gateway_subscription_id: `sub_${Math.random().toString(36).substr(2, 9)}`,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", subscription.id);

    if (subError) {
      throw new Error(`Falha ao ativar assinatura: ${subError.message}`);
    }

    return { ok: true, invoiceNumber };
  });

