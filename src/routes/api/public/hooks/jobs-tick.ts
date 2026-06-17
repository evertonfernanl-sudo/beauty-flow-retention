import { createFileRoute } from "@tanstack/react-router";

// Worker tick: drains pending jobs from public.jobs.
// Called by pg_cron once per minute (or manually via curl).
// Auth: requires the project anon key in `apikey` header (default for /api/public/*).

export const Route = createFileRoute("/api/public/hooks/jobs-tick")({
  server: {
    handlers: {
      POST: async () => handle(),
      GET: async () => handle(),
    },
  },
});

async function handle() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const processed: Array<{ id: string; type: string; ok: boolean; error?: string }> = [];
  const MAX_PER_TICK = 20;

  for (let i = 0; i < MAX_PER_TICK; i++) {
    const { data: job, error: claimErr } = await supabaseAdmin.rpc("claim_next_job");
    if (claimErr) {
      return json({ ok: false, error: claimErr.message, processed }, 500);
    }
    if (!job) break;

    const j = job as {
      id: string;
      type: string;
      payload: Record<string, unknown> | null;
      company_id: string | null;
    };

    try {
      const result = await dispatch(j, supabaseAdmin);
      await supabaseAdmin.rpc("finish_job", {
        _id: j.id,
        _ok: true,
        _result: (result ?? {}) as never,
      });
      processed.push({ id: j.id, type: j.type, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin.rpc("finish_job", {
        _id: j.id,
        _ok: false,
        _error: msg,
      });
      processed.push({ id: j.id, type: j.type, ok: false, error: msg });
    }
  }

  return json({ ok: true, processed, count: processed.length });
}

async function dispatch(
  job: { type: string; payload: Record<string, unknown> | null; company_id: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<Record<string, unknown> | null> {
  switch (job.type) {
    case "noop":
      return { echo: job.payload ?? {} };

    case "recovery.refresh": {
      const { error } = await admin.rpc("refresh_recovery_opportunities", {
        _company: job.company_id,
      });
      if (error) throw new Error(error.message);
      return { refreshed: true, company_id: job.company_id };
    }

    case "returns.refresh": {
      const { error } = await admin.rpc("refresh_return_opportunities");
      if (error) throw new Error(error.message);
      return { refreshed: true };
    }

    case "import.commit": {
      const payload = (job.payload ?? {}) as {
        clients?: Array<{
          name: string;
          phone: string | null;
          email: string | null;
          birthday: string | null;
          notes: string | null;
        }>;
      };
      const clients = payload.clients ?? [];
      if (!job.company_id) throw new Error("import.commit: missing company_id");
      if (clients.length === 0) return { inserted: 0 };
      const rows = clients.map((c) => ({
        company_id: job.company_id,
        name: c.name,
        phone: c.phone ?? null,
        email: c.email ?? null,
        birthday: c.birthday ?? null,
        notes: c.notes ?? null,
        status: "ACTIVE" as const,
      }));
      const { data, error } = await admin.from("clients").insert(rows).select("id");
      if (error) throw new Error(error.message);
      return { inserted: data?.length ?? 0 };
    }

    case "campaign.record": {
      const p = (job.payload ?? {}) as {
        name: string;
        segment: string;
        template_id: string | null;
        message_body: string;
        sent_count: number;
      };
      if (!job.company_id) throw new Error("campaign.record: missing company_id");
      const { error } = await admin.from("campaigns").insert({
        company_id: job.company_id,
        name: p.name,
        segment: p.segment,
        template_id: p.template_id ?? null,
        message_body: p.message_body,
        sent_count: p.sent_count ?? 0,
        last_sent_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
