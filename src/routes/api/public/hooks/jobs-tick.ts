import { createFileRoute } from "@tanstack/react-router";
import Papa from "papaparse";
import * as XLSX from "xlsx";

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

const MAX_PER_TICK = 20;

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
  const processed: Array<{ id: string; type: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < MAX_PER_TICK; i++) {
    const { data: job, error: claimErr } = await supabaseAdmin.rpc("claim_next_job");
    if (claimErr) return json({ ok: false, error: claimErr.message, processed }, 500);
    if (!job) break;
    const j = job as { id: string; type: string; payload: Record<string, unknown> | null; company_id: string | null };
    try {
      const result = await dispatch(j, supabaseAdmin);
      await supabaseAdmin.rpc("finish_job", { _id: j.id, _ok: true, _result: (result ?? {}) as never });
      processed.push({ id: j.id, type: j.type, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin.rpc("finish_job", { _id: j.id, _ok: false, _error: msg });
      processed.push({ id: j.id, type: j.type, ok: false, error: msg });
    }
  }
  return json({ ok: true, processed, count: processed.length });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function dispatch(
  job: { id: string; type: string; payload: Record<string, unknown> | null; company_id: string | null },
  admin: Admin,
): Promise<Record<string, unknown> | null> {
  switch (job.type) {
    case "noop":
      return { echo: job.payload ?? {} };

    case "recovery.refresh": {
      const { error } = await admin.rpc("refresh_recovery_opportunities", { _company: job.company_id });
      if (error) throw new Error(error.message);
      return { refreshed: true };
    }
    case "returns.refresh": {
      const { error } = await admin.rpc("refresh_return_opportunities");
      if (error) throw new Error(error.message);
      return { refreshed: true };
    }

    case "import.commit":
      return await runImportCommit(admin, job);

    case "campaign.record":
      return await runCampaignRecord(admin, job);

    case "import.parse":
      return await runImportParse(admin, job);

    case "import.apply_row":
      return await runImportApplyRow(admin, job);

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

// ===================== legacy import.commit =====================
async function runImportCommit(admin: Admin, job: { payload: Record<string, unknown> | null; company_id: string | null }) {
  const payload = (job.payload ?? {}) as {
    clients?: Array<{ name: string; phone: string | null; email: string | null; birthday: string | null; notes: string | null }>;
  };
  const clients = payload.clients ?? [];
  if (!job.company_id) throw new Error("import.commit: missing company_id");
  if (clients.length === 0) return { inserted: 0, merged: 0 };
  let inserted = 0, merged = 0;
  for (const c of clients) {
    let existingId: string | null = null;
    if (c.phone) {
      const { data: dup } = await admin.rpc("find_duplicate_client", {
        _company_id: job.company_id, _name: c.name, _phone: c.phone, _threshold: 1.0,
      });
      const first = Array.isArray(dup) ? dup[0] : null;
      if (first?.reason === "phone") existingId = first.id as string;
    }
    if (existingId) {
      await admin.from("clients").update({
        email: c.email ?? undefined, birthday: c.birthday ?? undefined, notes: c.notes ?? undefined,
      }).eq("id", existingId).is("email", null);
      merged++;
    } else {
      const { error } = await admin.from("clients").insert({
        company_id: job.company_id, name: c.name, phone: c.phone ?? null, email: c.email ?? null,
        birthday: c.birthday ?? null, notes: c.notes ?? null, status: "ACTIVE",
      });
      if (error) { if (error.code === "23505") merged++; else throw new Error(error.message); } else inserted++;
    }
  }
  return { inserted, merged, total: clients.length };
}

async function runCampaignRecord(admin: Admin, job: { payload: Record<string, unknown> | null; company_id: string | null }) {
  const p = (job.payload ?? {}) as { name: string; segment: string; template_id: string | null; message_body: string; sent_count: number };
  if (!job.company_id) throw new Error("campaign.record: missing company_id");
  const { error } = await admin.from("campaigns").insert({
    company_id: job.company_id, name: p.name, segment: p.segment, template_id: p.template_id ?? null,
    message_body: p.message_body, sent_count: p.sent_count ?? 0, last_sent_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ===================== SIE: import.parse =====================
const HEADER_MAP: Record<string, RegExp> = {
  name: /^(nome|name|cliente|client|customer|contato)$/i,
  phone: /^(telefone|fone|phone|whatsapp|celular|cel)$/i,
  email: /^(e-?mail|email)$/i,
  amount: /^(valor|amount|preco|preço|price|total|vlr)$/i,
  date: /^(data|date|dt|dia|quando|occurred|venda|atendimento)$/i,
  description: /^(descricao|descrição|description|historico|histórico|obs|observa|servico|serviço|produto)$/i,
  payment: /^(pagamento|payment|metodo|método|forma)$/i,
};

function detectColumns(headers: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  headers.forEach((h, i) => {
    const norm = (h ?? "").toString().trim();
    for (const [key, re] of Object.entries(HEADER_MAP)) {
      if (out[key] === undefined && re.test(norm)) out[key] = i;
    }
  });
  return out;
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v * 100) / 100;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (br) {
    const [, dd, mm, yy] = br;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function detectPaymentMethod(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const s = desc.toLowerCase();
  if (/\bpix\b/.test(s)) return "PIX";
  if (/cart(ã|a)o|credit|debito|débito/.test(s)) return "CARD";
  if (/dinheiro|cash|esp(é|e)cie/.test(s)) return "CASH";
  if (/transfer|ted|doc/.test(s)) return "TRANSFER";
  if (/boleto/.test(s)) return "BOLETO";
  return null;
}

// Native-text PDF → tabular rows. Detects delimited tables first; falls back
// to per-line heuristics (name + phone + amount + date).
function parsePdfTextToRows(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  // 1) Try delimited table (CSV/TSV/semicolon/pipe leaked into PDF)
  for (const delim of [";", "\t", "|", ","]) {
    const headerCells = lines[0].split(delim).map((s) => s.trim());
    if (headerCells.length >= 2 && lines.slice(1, 6).every((l) => l.split(delim).length >= 2)) {
      const headers = headerCells;
      const rows = lines.slice(1).map((l) => {
        const parts = l.split(delim);
        const o: Record<string, unknown> = {};
        headers.forEach((h, i) => (o[h] = (parts[i] ?? "").trim()));
        return o;
      });
      return { headers, rows };
    }
  }

  // 2) Heuristic line-by-line extraction
  const headers = ["nome", "telefone", "valor", "data", "descricao"];
  const phoneRe = /(\(?\d{2}\)?\s*\d{4,5}-?\s*\d{4})/;
  const amountRe = /R?\$?\s*([\d.]+,\d{2}|\d+\.\d{2})/;
  const dateRe = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/;
  const rows: Record<string, unknown>[] = [];
  for (const line of lines) {
    const phone = line.match(phoneRe)?.[1] ?? "";
    const amount = line.match(amountRe)?.[1] ?? "";
    const date = line.match(dateRe)?.[1] ?? "";
    let rest = line;
    [phone, amount, date].forEach((v) => { if (v) rest = rest.replace(v, " "); });
    rest = rest.replace(/R\$\s*/gi, " ").replace(/\s+/g, " ").trim();
    // Name = leading alpha tokens (>=2 chars, letters/spaces)
    const nameMatch = rest.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.\s]{2,}?)(?=\s{2,}|\s-|$|\s\d)/);
    const name = (nameMatch?.[1] ?? "").trim();
    const description = rest.replace(name, "").trim();
    if (!name && !phone && !amount) continue;
    rows.push({ nome: name, telefone: phone, valor: amount, data: date, descricao: description });
  }
  return { headers, rows };
}

async function runImportParse(admin: Admin, job: { payload: Record<string, unknown> | null; company_id: string | null }) {
  const { import_id } = (job.payload ?? {}) as { import_id?: string };

  if (!import_id || !job.company_id) throw new Error("import.parse: missing import_id/company_id");

  await admin.from("imports").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", import_id);

  const { data: imp, error: impErr } = await admin
    .from("imports").select("id, source, storage_path, company_id").eq("id", import_id).single();
  if (impErr || !imp) throw new Error(impErr?.message ?? "import not found");
  if (!imp.storage_path) throw new Error("import sem storage_path");

  const { data: file, error: dlErr } = await admin.storage.from("imports").download(imp.storage_path);
  if (dlErr || !file) throw new Error(`download falhou: ${dlErr?.message}`);

  let rows: Record<string, unknown>[] = [];
  let headers: string[] = [];

  if (imp.source === "csv") {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const data = parsed.data as string[][];
    if (data.length === 0) throw new Error("CSV vazio");
    headers = data[0].map((h) => String(h ?? "").trim());
    rows = data.slice(1).map((r) => {
      const o: Record<string, unknown> = {};
      headers.forEach((h, i) => (o[h] = r[i]));
      return o;
    });
  } else if (imp.source === "xlsx") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    if (aoa.length === 0) throw new Error("Planilha vazia");
    headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim());
    rows = aoa.slice(1).map((r) => {
      const o: Record<string, unknown> = {};
      headers.forEach((h, i) => (o[h] = (r as unknown[])[i]));
      return o;
    });
  } else if (imp.source === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    if (!fullText.trim()) throw new Error("PDF sem texto extraível (pode ser escaneado).");
    const parsed = parsePdfTextToRows(fullText);
    headers = parsed.headers;
    rows = parsed.rows;
    if (rows.length === 0) throw new Error("Nenhuma linha reconhecida no PDF.");
  } else {
    throw new Error(`Fonte não suportada nesta fase: ${imp.source}`);
  }


  const cols = detectColumns(headers);
  const idx = (k: string) => (cols[k] !== undefined ? headers[cols[k]] : null);

  let total = 0, matched = 0, review = 0, failed = 0, revenue = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = idx("name") ? String(r[idx("name")!] ?? "").trim() : "";
    const phoneRaw = idx("phone") ? String(r[idx("phone")!] ?? "").trim() : "";
    const description = idx("description") ? String(r[idx("description")!] ?? "").trim() : null;
    const amount = parseAmount(idx("amount") ? r[idx("amount")!] : null);
    const occurred = parseDate(idx("date") ? r[idx("date")!] : null);
    const paymentMethod = (idx("payment") ? String(r[idx("payment")!] ?? "").trim() : null) || detectPaymentMethod(description);

    if (!name && !phoneRaw && amount == null) continue;
    total++;

    // Normalize phone via RPC for consistency with rest of system
    let phoneApi: string | null = null;
    if (phoneRaw) {
      const { data: p } = await admin.rpc("normalize_phone", { _phone: phoneRaw });
      phoneApi = (p as string | null) ?? null;
    }

    // Identity resolution
    let clientId: string | null = null;
    let clientFound = false;
    if (name || phoneRaw) {
      const { data: dup } = await admin.rpc("find_duplicate_client", {
        _company_id: job.company_id, _name: name || "", _phone: phoneRaw || "", _threshold: 0.7,
      });
      const first = Array.isArray(dup) ? dup[0] : null;
      if (first) { clientId = first.id; clientFound = true; }
    }

    // Offering prediction
    let offeringId: string | null = null;
    let offeringKind: string | null = null;
    let offeringLabel: string | null = null;
    let amountMatch = false;
    let descMatch = false;
    let tenantPattern = false;
    if (amount != null) {
      const { data: pred } = await admin.rpc("predict_offering_from_amount", {
        _company_id: job.company_id, _amount: amount,
      });
      const p = Array.isArray(pred) ? pred[0] : null;
      if (p?.entity_id) {
        offeringId = p.entity_id; offeringKind = p.entity_type; offeringLabel = p.label;
        amountMatch = true;
        if (p.reason === "kb_amount") tenantPattern = true;
      }
    }
    if (description) {
      const { data: kb } = await admin
        .from("import_knowledge_base")
        .select("mapped_entity_id, mapped_entity_type, mapped_label, confidence")
        .eq("company_id", job.company_id)
        .eq("pattern_type", "description")
        .eq("pattern_value", description.toLowerCase())
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (kb?.mapped_entity_id) {
        descMatch = true; tenantPattern = true;
        if (!offeringId) {
          offeringId = kb.mapped_entity_id; offeringKind = kb.mapped_entity_type; offeringLabel = kb.mapped_label;
        }
      }
    }

    const hasHistory = clientFound;
    const { data: confData } = await admin.rpc("compute_import_confidence", {
      _client_found: clientFound,
      _amount_match: amountMatch,
      _desc_match: descMatch,
      _has_history: hasHistory,
      _tenant_pattern: tenantPattern,
    });
    const confidence = (confData as number) ?? 0;

    const status =
      confidence >= 95 ? "matched" :
      confidence >= 70 ? "review" :
      confidence > 0 ? "manual" : "manual";

    if (status === "matched") matched++;
    else if (status === "review") review++;

    const { error: rowErr } = await admin.from("import_rows").insert({
      import_id, company_id: job.company_id, row_index: i,
      raw: r as never, parsed: { name, phoneRaw, description, amount, occurred, paymentMethod } as never,
      client_name: name || null, client_phone: phoneApi,
      description, amount, occurred_at: occurred, payment_method: paymentMethod,
      resolved_client_id: clientId, resolved_offering_id: offeringId, resolved_offering_kind: offeringKind,
      confidence, status,
      notes: offeringLabel ? `Sugestão: ${offeringLabel}` : null,
    });
    if (rowErr) { failed++; await admin.from("import_errors").insert({
      import_id, company_id: job.company_id, code: "row_insert", message: rowErr.message,
    }); continue; }

    if (amount && status === "matched") revenue += Number(amount);
  }

  await admin.from("imports").update({
    status: "completed",
    rows_total: total, rows_matched: matched, rows_review: review, rows_failed: failed,
    revenue_identified: revenue,
    finished_at: new Date().toISOString(),
  }).eq("id", import_id);

  return { total, matched, review, failed, revenue };
}

// ===================== SIE: import.apply_row =====================
async function runImportApplyRow(admin: Admin, job: { payload: Record<string, unknown> | null; company_id: string | null }) {
  const { row_id, create_appointment } = (job.payload ?? {}) as { row_id?: string; create_appointment?: boolean };
  if (!row_id) throw new Error("import.apply_row: missing row_id");

  const { data: row, error } = await admin.from("import_rows").select("*").eq("id", row_id).single();
  if (error || !row) throw new Error(error?.message ?? "row not found");
  if (row.status === "applied") return { skipped: true };

  const companyId = row.company_id as string;
  let clientId: string | null = row.resolved_client_id;
  let createdClient = false;

  if (!clientId && (row.client_name || row.client_phone)) {
    const { data: c, error: ce } = await admin.from("clients").insert({
      company_id: companyId,
      name: row.client_name ?? "Cliente importado",
      phone: row.client_phone ?? null,
      status: "ACTIVE",
      notes: "Criado pela importação",
    }).select("id").single();
    if (ce) throw new Error(`cliente: ${ce.message}`);
    clientId = c.id; createdClient = true;
  }

  let appointmentId: string | null = null;
  let transactionId: string | null = null;

  if (clientId && row.amount && create_appointment !== false) {
    const start = row.occurred_at ? new Date(`${row.occurred_at}T12:00:00Z`) : new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const { data: ap, error: ae } = await admin.from("appointments").insert({
      company_id: companyId,
      client_id: clientId,
      service_id: row.resolved_offering_kind === "service" ? row.resolved_offering_id : null,
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      status: "COMPLETED",
      price: row.amount,
      source: "import",
      completed_at: start.toISOString(),
      notes: row.description ?? null,
    }).select("id").single();
    if (ae) throw new Error(`appointment: ${ae.message}`);
    appointmentId = ap.id;

    const { data: tx } = await admin.from("financial_transactions").insert({
      company_id: companyId, type: "INCOME", category: "Importação",
      description: row.description ?? "Atendimento histórico (import)",
      amount: row.amount,
      transaction_date: row.occurred_at ?? new Date().toISOString().slice(0, 10),
      appointment_id: appointmentId,
      payment_method: row.payment_method ?? null,
    }).select("id").maybeSingle();
    transactionId = tx?.id ?? null;
  }

  // IIL learning
  if (row.amount && row.resolved_offering_id) {
    await admin.rpc("learn_pattern", {
      _company_id: companyId, _type: "amount",
      _value: row.amount.toFixed(2),
      _entity_type: row.resolved_offering_kind, _entity_id: row.resolved_offering_id,
      _label: null, _delta: 1,
    });
  }
  if (row.description && row.resolved_offering_id) {
    await admin.rpc("learn_pattern", {
      _company_id: companyId, _type: "description",
      _value: row.description,
      _entity_type: row.resolved_offering_kind, _entity_id: row.resolved_offering_id,
      _label: null, _delta: 1,
    });
  }
  if (row.payment_method) {
    await admin.from("payment_behavior_profiles")
      .upsert({ company_id: companyId, payment_method: row.payment_method, hits: 1 },
        { onConflict: "company_id,payment_method", ignoreDuplicates: false });
    await admin.rpc("learn_pattern", {
      _company_id: companyId, _type: "bank_description",
      _value: row.payment_method, _entity_type: null, _entity_id: null, _label: null, _delta: 1,
    });
  }
  if (clientId) await admin.rpc("refresh_client_behavior_profile", { _client_id: clientId });

  await admin.from("import_rows").update({
    status: "applied",
    action_taken: createdClient ? "create_client" : "merge_client",
    resolved_client_id: clientId,
    appointment_id: appointmentId,
    transaction_id: transactionId,
  }).eq("id", row_id);

  await admin.from("import_matches").insert({
    import_id: row.import_id, company_id: companyId, row_id,
    entity_type: "client", entity_id: clientId, confidence: row.confidence,
    reason: createdClient ? "created" : "matched", action: createdClient ? "created" : "matched",
  });

  // Increment import counters
  if (createdClient || appointmentId || transactionId) {
    const { data: cur } = await admin
      .from("imports")
      .select("clients_created,appointments_created,transactions_created")
      .eq("id", row.import_id)
      .single();
    if (cur) {
      await admin.from("imports").update({
        clients_created: cur.clients_created + (createdClient ? 1 : 0),
        appointments_created: cur.appointments_created + (appointmentId ? 1 : 0),
        transactions_created: cur.transactions_created + (transactionId ? 1 : 0),
      }).eq("id", row.import_id);
    }
  }

  return { clientId, appointmentId, transactionId, createdClient };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
