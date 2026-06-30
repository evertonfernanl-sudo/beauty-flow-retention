import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RegisterInput = z.object({
  filename: z.string().min(1).max(255),
  storagePath: z.string().min(1).max(500),
  size: z.number().int().nonnegative(),
  source: z.enum(["csv", "xlsx", "pdf"]),
});

export const registerImportV3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RegisterInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");
    const { data: imp, error } = await supabase.from("v3_imports").insert({
      company_id: profile.company_id,
      source: data.source,
      filename: data.filename,
      storage_path: data.storagePath,
      size_bytes: data.size,
      status: "uploaded",
      created_by: userId,
    }).select("id").single();
    if (error) throw new Error(error.message);

    // Executa pipeline inline (síncrono). Erros são capturados e gravados em v3_imports.last_error.
    try {
      const { runPipeline } = await import("@/lib/api/v3/pipeline.server");
      await runPipeline(supabase as any, {
        importId: imp.id,
        companyId: profile.company_id,
        source: data.source,
        storagePath: data.storagePath,
      });
    } catch (e: any) {
      // Já registrado pelo pipeline; devolve sucesso parcial para UI poder navegar à revisão.
      return { success: false, importId: imp.id, error: e.message ?? String(e) } as const;
    }
    return { success: true, importId: imp.id } as const;
  });

export const applyRowV3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ rowId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { applyRow } = await import("@/lib/api/v3/pipeline.server");
    return await applyRow(context.supabase as any, { rowId: data.rowId });
  });

export const deleteImportV3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ importId: z.string().uuid(), storagePath: z.string().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.storagePath) await context.supabase.storage.from("imports").remove([data.storagePath]);
    const { error } = await context.supabase.from("v3_imports").delete().eq("id", data.importId);
    if (error) throw new Error(error.message);
    return { success: true } as const;
  });
