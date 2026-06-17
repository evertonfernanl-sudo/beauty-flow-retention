import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toStoragePhone } from "@/lib/phone";

const ClientRow = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(255).optional().nullable(),
  birthday: z.string().trim().max(10).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type ParsedClient = z.infer<typeof ClientRow>;

const SYSTEM_PROMPT = `Você é um extrator de dados para um CRM brasileiro de beleza/vendas/academia.
Receba um texto livre (CSV, lista de contatos colada do WhatsApp, planilha, etc.) e retorne
APENAS um JSON com a chave "clients" contendo um array de objetos no formato:
{ "name": string, "phone": string|null, "email": string|null, "birthday": "YYYY-MM-DD"|null, "notes": string|null }

Regras:
- Normalize telefones para apenas dígitos com DDD (ex: 11999998888).
- Ignore cabeçalhos, separadores, e linhas vazias.
- Se não houver nome claro, ignore a linha.
- Não invente dados. Campos ausentes devem ser null.
- Datas no formato ISO YYYY-MM-DD.
- Máximo de 200 registros.`;

export const parseImportText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ text: z.string().trim().min(3).max(50_000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI indisponível: LOVABLE_API_KEY ausente.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: data.text },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("Muitas requisições. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Falha no AI Gateway (${res.status}): ${t.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error("IA retornou formato inválido."); }
    const arr = (parsed as { clients?: unknown }).clients;
    if (!Array.isArray(arr)) return { clients: [] as ParsedClient[] };

    const out: ParsedClient[] = [];
    for (const item of arr.slice(0, 200)) {
      const r = ClientRow.safeParse(item);
      if (r.success) {
        out.push({
          ...r.data,
          phone: r.data.phone ? toStoragePhone(r.data.phone) ?? r.data.phone : null,
        });
      }
    }
    return { clients: out };
  });

export const commitImportClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clients: z.array(ClientRow).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");
    const companyId = profile.company_id;

    const rows = data.clients.map((c) => ({
      company_id: companyId,
      name: c.name,
      phone: c.phone ? toStoragePhone(c.phone) ?? c.phone : null,
      email: c.email || null,
      birthday: c.birthday || null,
      notes: c.notes || null,
      status: "ACTIVE" as const,
    }));

    const { data: inserted, error } = await supabase
      .from("clients").insert(rows).select("id");
    if (error) throw new Error(error.message);
    return { inserted: inserted?.length ?? 0 };
  });
