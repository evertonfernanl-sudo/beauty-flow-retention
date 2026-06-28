import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RegisterInput = z.object({
  filename: z.string().min(1).max(255),
  storagePath: z.string().min(1).max(500),
  size: z.number().int().nonnegative(),
  source: z.enum(["csv", "xlsx", "pdf", "ofx", "manual_text"]),
});

export const registerImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RegisterInput.parse(i))
  .handler(async ({ data, context }) => {
    let importId: string | null = null;
    try {
      const { supabase, userId } = context;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.company_id) throw new Error("Empresa não encontrada");

      const { data: imp, error } = await supabase
        .from("imports")
        .insert({
          company_id: profile.company_id,
          source: data.source,
          filename: data.filename,
          storage_path: data.storagePath,
          size_bytes: data.size,
          status: "uploaded",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Falha ao registrar importação no banco: ${error.message}`);
      
      importId = imp.id;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { runImportParse } = await import("@/lib/api/worker.server");

      // Insere o job diretamente como RUNNING para evitar interferência de filas e jobs travados concorrentes
      const { data: job, error: qErr } = await supabaseAdmin
        .from("jobs")
        .insert({
          company_id: profile.company_id,
          type: "import.parse",
          payload: { import_id: imp.id },
          priority: 10,
          status: "RUNNING",
          started_at: new Date().toISOString()
        })
        .select()
        .single();
      if (qErr) throw new Error(`Falha ao registrar job de processamento: ${qErr.message}`);

      try {
        const result = await runImportParse(supabaseAdmin, {
          payload: { import_id: imp.id },
          company_id: profile.company_id
        });
        
        // Atualiza o job para DONE no banco
        await supabaseAdmin.rpc("finish_job", {
          _id: job.id,
          _ok: true,
          _result: result
        });
      } catch (err: any) {
        // Atualiza o job para FAILED no banco
        await supabaseAdmin.rpc("finish_job", {
          _id: job.id,
          _ok: false,
          _error: err.message || String(err)
        });
        throw err;
      }

      return { success: true, importId: imp.id };
    } catch (err: any) {
      console.error("[registerImport SERVER ERROR]:", err);
      
      if (importId) {
        try {
          const { supabase } = context;
          const stage = err.stage || "SERVER_FUNCTION";
          const errorMsg = `[ETAPA: ${stage}] ${err.message ?? String(err)}\nStack: ${err.stack || "Sem stack"}`;
          await supabase
            .from("imports")
            .update({
              status: "failed",
              last_error: errorMsg,
              finished_at: new Date().toISOString()
            })
            .eq("id", importId);
        } catch (dbErr) {
          console.error("Erro ao registrar falha de auditoria no Supabase:", dbErr);
        }
      }

      return { success: false, error: err.message ?? String(err) };
    }
  });

export const applyImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ rowId: z.string().uuid(), createAppointment: z.boolean().default(true) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("import_rows")
      .select("company_id")
      .eq("id", data.rowId)
      .maybeSingle();
    if (error || !row) throw new Error("Linha não encontrada");

    const { data: jobId, error: qErr } = await supabase.rpc("enqueue_job", {
      _company_id: row.company_id,
      _type: "import.apply_row",
      _payload: {
        row_id: data.rowId,
        create_appointment: data.createAppointment,
        approved_by: userId,
      } as never,
      _priority: 4,
    });
    if (qErr) throw new Error(qErr.message);

    // Trigger worker and run in background (prevents HTTP timeouts on slow operations like OCR)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runWorker } = await import("@/lib/api/worker.server");
    runWorker(supabaseAdmin).catch((err) => {
      console.error("[Worker] Run error:", err);
    });

    return { jobId };
  });

export const applyImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        importId: z.string().uuid().optional(),
        minConfidence: z.number().min(0).max(100).optional(),
        rowIds: z.array(z.string().uuid()).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let rows: Array<{ id: string; company_id: string; confidence: number; status: string }> = [];

    if (data.rowIds && data.rowIds.length > 0) {
      const { data: dbRows, error } = await supabase
        .from("import_rows")
        .select("id, company_id, confidence, status")
        .in("id", data.rowIds)
        .in("status", ["matched", "review"]);
      if (error) throw new Error(error.message);
      rows = dbRows ?? [];
    } else if (data.importId) {
      const minConf = data.minConfidence ?? 85;
      const { data: dbRows, error } = await supabase
        .from("import_rows")
        .select("id, company_id, confidence, status")
        .eq("import_id", data.importId)
        .in("status", ["matched", "review"])
        .gte("confidence", minConf);
      if (error) throw new Error(error.message);
      rows = dbRows ?? [];
    }

    let queued = 0;
    for (const r of rows) {
      const { error: qErr } = await supabase.rpc("enqueue_job", {
        _company_id: r.company_id,
        _type: "import.apply_row",
        _payload: { row_id: r.id, create_appointment: true } as never,
        _priority: 4,
      });
      if (!qErr) queued++;
    }

    if (queued > 0) {
      // Trigger worker and run in background (prevents HTTP timeouts on slow operations like OCR)
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { runWorker } = await import("@/lib/api/worker.server");
      runWorker(supabaseAdmin).catch((err) => {
        console.error("[Worker] Run error:", err);
      });
    }

    return { queued };
  });

export const convertPdfToCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        base64: z.string(),
        filename: z.string(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { convertPdfBufferToCsv } = await import("@/lib/api/worker.server");
    const buf = Buffer.from(data.base64, "base64");
    try {
      const csvText = await convertPdfBufferToCsv(new Uint8Array(buf), data.filename);
      return { success: true, csvText };
    } catch (err: any) {
      console.error("[convertPdfToCsv ERROR]:", err);
      return { success: false, error: err.message || String(err) };
    }
  });
