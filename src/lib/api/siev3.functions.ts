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
    try {
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
      console.log(`\n[PHASE 0 LOG] IMPORT ${imp.id}\nStage: registerImportV3\nRows: 0\nTime: 0 ms\nStatus: OK`);
      
      const { runPipeline } = await import("@/lib/api/v3/pipeline.server");
      const result = await runPipeline(supabase as any, {
        importId: imp.id,
        companyId: profile.company_id!,
        source: data.source,
        storagePath: data.storagePath,
      });
      return { success: true, importId: imp.id, csvText: result.csvText, error: undefined as string | undefined } as const;
    } catch (e: any) {
      console.error("Erro na execução da pipeline V3:", e);
      return { success: false, importId: undefined, csvText: undefined as string | undefined, error: e.message ?? String(e) } as const;
    }
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

export const updateRowV3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    rowId: z.string().uuid(),
    updates: z.object({
      resolved_client_id: z.string().uuid().nullable().optional(),
      resolved_service_id: z.string().uuid().nullable().optional(),
      status: z.enum(["OK", "LINE_FAILED", "LINE_REVIEW", "applied", "skipped"]).optional(),
      suggestions: z.record(z.any()).optional(),
    }),
    auditEvent: z.string().min(1),
    auditReason: z.string().min(1),
    oldValue: z.any().optional(),
    newValue: z.any().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    // Fetch row first to get company_id and import_id
    const { data: row, error: fetchErr } = await supabase
      .from("v3_import_rows")
      .select("company_id, import_id")
      .eq("id", data.rowId)
      .single();
    if (fetchErr || !row) throw new Error("Linha não encontrada");

    // Update row
    const { error: updateErr } = await supabase
      .from("v3_import_rows")
      .update(data.updates)
      .eq("id", data.rowId);
    if (updateErr) throw new Error(updateErr.message);

    // Audit Log
    const { error: auditErr } = await supabase.from("v3_audit_log").insert({
      import_id: row.import_id,
      company_id: row.company_id,
      row_id: data.rowId,
      stage: "user_correction",
      event: data.auditEvent,
      input: data.oldValue ? { value: data.oldValue } : null,
      output: data.newValue ? { value: data.newValue } : null,
      reason: data.auditReason,
      responsavel: "Usuário",
      algorithm_version: "v3.0.0",
    } as any);
    if (auditErr) {
      console.error("Erro ao gravar log de auditoria:", auditErr.message);
    }

    return { success: true } as const;
  });

