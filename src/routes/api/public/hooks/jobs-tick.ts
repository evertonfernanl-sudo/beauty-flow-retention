import { createFileRoute } from "@tanstack/react-router";

// Worker tick. Drains pending jobs in public.jobs.
// Called by pg_cron once per minute via /api/public/hooks/jobs-tick.

export const Route = createFileRoute("/api/public/hooks/jobs-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

function authorized(request: Request): boolean {
  const expected = process.env.JOBS_TICK_SECRET;
  if (!expected) return false;
  const header = request.headers.get("x-hook-secret") ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  return header === expected || bearer === expected;
}

async function handle(request: Request) {
  if (!authorized(request)) return json({ ok: false, error: "forbidden" }, 403);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runWorker } = await import("@/lib/api/worker.server");

  try {
    const processed = await runWorker(supabaseAdmin);
    return json({ ok: true, processed, count: processed.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: msg }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
