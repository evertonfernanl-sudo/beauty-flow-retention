import Papa from "papaparse";
import * as XLSX from "xlsx";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const MAX_PER_TICK = 20;

export async function runWorker(admin: Admin): Promise<Array<{ id: string; type: string; ok: boolean; error?: string }>> {
  const processed: Array<{ id: string; type: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < MAX_PER_TICK; i++) {
    const { data: job, error: claimErr } = await admin.rpc("claim_next_job");
    if (claimErr) throw new Error(claimErr.message);
    if (!job) break;
    const j = job as {
      id: string;
      type: string;
      payload: Record<string, unknown> | null;
      company_id: string | null;
    };
    try {
      const result = await dispatch(j, admin);
      await admin.rpc("finish_job", {
        _id: j.id,
        _ok: true,
        _result: (result ?? {}) as never,
      });
      processed.push({ id: j.id, type: j.type, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin.rpc("finish_job", { _id: j.id, _ok: false, _error: msg });
      processed.push({ id: j.id, type: j.type, ok: false, error: msg });
    }
  }
  return processed;
}

async function dispatch(
  job: {
    id: string;
    type: string;
    payload: Record<string, unknown> | null;
    company_id: string | null;
  },
  admin: Admin,
): Promise<Record<string, unknown> | null> {
  switch (job.type) {
    case "noop":
      return { echo: job.payload ?? {} };

    case "recovery.refresh": {
      const { error } = await admin.rpc("refresh_recovery_opportunities", {
        _company: job.company_id,
      });
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
async function runImportCommit(
  admin: Admin,
  job: { payload: Record<string, unknown> | null; company_id: string | null },
) {
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
  if (clients.length === 0) return { inserted: 0, merged: 0 };
  let inserted = 0,
    merged = 0;
  for (const c of clients) {
    let existingId: string | null = null;
    if (c.phone) {
      const { data: dup } = await admin.rpc("find_duplicate_client", {
        _company_id: job.company_id,
        _name: c.name,
        _phone: c.phone,
        _threshold: 1.0,
      });
      const first = Array.isArray(dup) ? dup[0] : null;
      if (first?.reason === "phone") existingId = first.id as string;
    }
    if (existingId) {
      await admin
        .from("clients")
        .update({
          email: c.email ?? undefined,
          birthday: c.birthday ?? undefined,
          notes: c.notes ?? undefined,
        })
        .eq("id", existingId)
        .is("email", null);
      merged++;
    } else {
      const { error } = await admin.from("clients").insert({
        company_id: job.company_id,
        name: c.name,
        phone: c.phone ?? null,
        email: c.email ?? null,
        birthday: c.birthday ?? null,
        notes: c.notes ?? null,
        status: "ACTIVE",
      });
      if (error) {
        if (error.code === "23505") merged++;
        else throw new Error(error.message);
      } else inserted++;
    }
  }
  return { inserted, merged, total: clients.length };
}

async function runCampaignRecord(
  admin: Admin,
  job: { payload: Record<string, unknown> | null; company_id: string | null },
) {
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

// ===================== SIE: import.parse =====================
const HEADER_MAP: Record<string, RegExp> = {
  name: /^(cliente|nome|name|client|customer|contato|first\s+name|given\s+name|nome\s+pr\S+prio|nome\s+proprio)$/i,
  phone:
    /^(telefone\s+1|telefone|fone|phone|whatsapp|celular|cel|phone\s+1(\s*-\s*value)?|telefone\s+1(\s*-\s*valor)?)$/i,
  phone2: /^(telefone\s+2|phone\s+2(\s*-\s*value)?|telefone\s+2(\s*-\s*valor)?)$/i,
  email: /^(e-?mail|email)$/i,
  amount: /^(valor|amount|preco|preço|price|total|vlr|valor\s*\(r\$\)|valor\s*r\$|quantia)$/i,
  date: /^(data|date|dt|dia|quando|occurred|venda|atendimento|data\s+do\s+lan\S+amento|data\s+lan\S+amento)$/i,
  description:
    /^(descri.*|hist.*|lan[cç].*|memo|complemento|obs|observa|servi[cç]o|produto)$/i,
  payment: /^(pagamento|payment|metodo|método|forma)$/i,
};

const isNameHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  return (
    (norm.includes("nome") || norm.includes("name") || norm.includes("cliente") || norm.includes("client") || norm.includes("contato") || norm.includes("customer")) &&
    !norm.includes("sobre") &&
    !norm.includes("last") &&
    !norm.includes("family") &&
    !norm.includes("mae") &&
    !norm.includes("mãe") &&
    !norm.includes("pai") &&
    !norm.includes("indicacao") &&
    !norm.includes("indicação")
  );
};

const isPhoneHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  return (
    norm.includes("tel") ||
    norm.includes("phone") ||
    norm.includes("cel") ||
    norm.includes("whats") ||
    norm.includes("móvel") ||
    norm.includes("movel") ||
    norm.includes("mobile")
  );
};

const isEmailHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  return norm.includes("email") || norm.includes("e-mail") || (norm.includes("mail") && !norm.includes("name"));
};

const isAmountHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  return (
    norm.includes("valor") ||
    norm.includes("preco") ||
    norm.includes("preço") ||
    norm.includes("price") ||
    norm.includes("amount") ||
    norm.includes("total") ||
    norm.includes("quantia") ||
    norm.includes("vlr")
  );
};

const isDateHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  return (
    norm.includes("data") ||
    norm.includes("date") ||
    norm.includes("dia") ||
    norm.includes("dt") ||
    norm.includes("quando") ||
    norm.includes("occurred")
  );
};

const isDescriptionHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  return (
    norm.includes("descri") ||
    norm.includes("hist") ||
    norm.includes("lanç") ||
    norm.includes("lanc") ||
    norm.includes("memo") ||
    norm.includes("complemento") ||
    norm.includes("obs") ||
    norm.includes("observa") ||
    norm.includes("servi") ||
    norm.includes("produto")
  );
};

const isPaymentHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  return (
    norm.includes("pagamento") ||
    norm.includes("payment") ||
    norm.includes("metodo") ||
    norm.includes("método") ||
    norm.includes("forma")
  );
};

function findHeaderRowIndex(rows: unknown[][]): number {
  let bestIndex = 0;
  let maxMatches = 0;
  
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    
    let matches = 0;
    row.forEach(cell => {
      const cellStr = String(cell ?? "").trim().toLowerCase();
      if (!cellStr) return;
      
      if (
        isNameHeader(cellStr) ||
        isPhoneHeader(cellStr) ||
        isEmailHeader(cellStr) ||
        isAmountHeader(cellStr) ||
        isDateHeader(cellStr) ||
        isDescriptionHeader(cellStr) ||
        isPaymentHeader(cellStr)
      ) {
        matches++;
      }
    });
    
    if (matches > maxMatches) {
      maxMatches = matches;
      bestIndex = i;
    }
  }
  
  return bestIndex;
}

function detectColumns(headers: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  headers.forEach((h, i) => {
    const norm = (h ?? "").toString().trim().toLowerCase();
    
    if (out["name"] === undefined && (norm === "cliente" || isNameHeader(norm))) {
      out["name"] = i;
    }
    if (out["phone"] === undefined && (norm === "telefone 1" || isPhoneHeader(norm))) {
      out["phone"] = i;
    }
    if (out["phone2"] === undefined && (norm === "telefone 2" || (isPhoneHeader(norm) && i !== out["phone"]))) {
      out["phone2"] = i;
    }
    if (out["email"] === undefined && isEmailHeader(norm)) {
      out["email"] = i;
    }
    if (out["amount"] === undefined && isAmountHeader(norm)) {
      out["amount"] = i;
    }
    if (out["date"] === undefined && isDateHeader(norm)) {
      out["date"] = i;
    }
    if (out["description"] === undefined && (norm === "descrição" || isDescriptionHeader(norm))) {
      out["description"] = i;
    }
    if (out["payment"] === undefined && isPaymentHeader(norm)) {
      out["payment"] = i;
    }
  });
  return out;
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v * 100) / 100;
  const originalStr = String(v).trim();
  const isNegative = originalStr.startsWith("-") || (originalStr.startsWith("(") && originalStr.endsWith(")"));
  const s = originalStr
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(s);
  if (!isFinite(n)) return null;
  const val = Math.round(n * 100) / 100;
  return isNegative ? -Math.abs(val) : val;
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
  const datePart = s.split(/\s+/)[0];
  const br = datePart.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (br) {
    const [, dd, mm, yy] = br;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const iso = datePart.match(/^(\d{4})-(\d{2})-(\d{2})/);
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

function parsePdfTextToRows(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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
    [phone, amount, date].forEach((v) => {
      if (v) rest = rest.replace(v, " ");
    });
    rest = rest
      .replace(/R\$\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Name = leading alpha tokens (>=2 chars, letters/spaces)
    const nameMatch = rest.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.\s]{2,}?)(?=\s{2,}|\s-|$|\s\d)/);
    const name = (nameMatch?.[1] ?? "").trim();
    const description = rest.replace(name, "").trim();
    if (!name && !phone && !amount) continue;
    rows.push({ nome: name, telefone: phone, valor: amount, data: date, descricao: description });
  }
  return { headers, rows };
}

function isExpenseDescription(desc: string | null | undefined): boolean {
  if (!desc) return false;
  const normalized = desc.trim().toLowerCase();
  return /^(pix\s+enviado|pix\s+para|transfer[êe]ncia\s+enviada|tarifa|compra|saque|pagamento\s+de\s+boleto|pagamento|juros|tributo|imposto|despesa)/i.test(
    normalized,
  );
}

function extractNameFromDescription(desc: string | null | undefined): string | null {
  if (!desc) return null;

  // Pattern 2: "Pix recebido de: Name" or "Pix Recebido de Name" or "Pix de Name"
  const pixMatch = desc.match(
    /(?:pix\s+recebido\s+de|pix\s+de|transferência\s+recebida\s+de|recebido\s+de)\s*:?\s*([A-Za-zÀ-ÿ\s]{6,60})/i,
  );
  if (pixMatch) {
    const name = pixMatch[1].trim();
    const words = name.split(/\s+/).filter((w) => w.length > 1);
    if (words.length >= 2) {
      return name;
    }
  }

  // Pattern 1: Splitting by "-" (very common in Brazilian bank statements)
  const parts = desc
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const nameRegex = /^[A-Za-zÀ-ÿ\s'\.\-]+$/;
    const excludeKeywords =
      /(transfer[êe]ncia|recebido|recebida|enviado|enviada|pix|ted|doc|pagamento|compra|saque|dep[óo]sito|tarifa|juros|saldo|extrato|ag[êe]ncia|conta|nu\s+pagamentos|nubank|ita[úu]|bradesco|santander|caixa|banco|pagseguro|stone|picpay|mercado\s+pago|inter|original)/i;

    for (const part of parts) {
      if (nameRegex.test(part) && !excludeKeywords.test(part)) {
        const words = part.split(/\s+/).filter((w) => w.length > 1);
        if (words.length >= 2) {
          return part;
        }
      }
    }
  }

  return null;
}

function findServiceCombination(
  target: number,
  services: Array<{ id: string; name: string; price: number }>,
): Array<{ id: string; name: string; price: number }> | null {
  const targetCents = Math.round(target * 100);
  const items = services
    .map((s) => ({ ...s, priceCents: Math.round(s.price * 100) }))
    .filter((s) => s.priceCents > 0 && s.priceCents <= targetCents);

  const result: Array<{ id: string; name: string; price: number }> = [];

  function search(index: number, currentSum: number): boolean {
    if (currentSum === targetCents) return true;
    if (currentSum > targetCents || index >= items.length) return false;

    // Try including items[index]
    result.push(items[index]);
    if (search(index + 1, currentSum + items[index].priceCents)) {
      return true;
    }
    result.pop(); // backtracking

    // Try excluding items[index]
    if (search(index + 1, currentSum)) {
      return true;
    }

    return false;
  }

  if (search(0, 0)) {
    return result;
  }
  return null;
}

function normalizeAndMapHeaders(rawHeaders: string[]): string[] {
  const cleanHeaders = rawHeaders.map(h => String(h ?? "").trim());
  const lowerHeaders = cleanHeaders.map(h => h.toLowerCase());
  
  let nameIndex = lowerHeaders.findIndex(h => h === "nome" || h === "name" || h === "cliente" || h === "client");
  if (nameIndex === -1) {
    nameIndex = lowerHeaders.findIndex(h => isNameHeader(h));
  }

  let phone1Index = -1;
  let phone2Index = -1;

  lowerHeaders.forEach((h, idx) => {
    if (isPhoneHeader(h)) {
      if (h.includes("1") || h.includes("value") || h.includes("valor")) {
        if (phone1Index === -1) phone1Index = idx;
      } else if (h.includes("2")) {
        if (phone2Index === -1) phone2Index = idx;
      }
    }
  });

  if (phone1Index === -1 || phone2Index === -1) {
    lowerHeaders.forEach((h, idx) => {
      if (isPhoneHeader(h) && idx !== phone1Index && idx !== phone2Index) {
        if (phone1Index === -1) {
          phone1Index = idx;
        } else if (phone2Index === -1) {
          phone2Index = idx;
        }
      }
    });
  }

  const descIndex = lowerHeaders.findIndex(h => isDescriptionHeader(h));
  
  return cleanHeaders.map((h, i) => {
    if (i === nameIndex) return "cliente";
    if (i === phone1Index) return "telefone 1";
    if (i === phone2Index) return "telefone 2";
    if (i === descIndex) return "descrição";
    return h;
  });
}

async function runImportParse(
  admin: Admin,
  job: { payload: Record<string, unknown> | null; company_id: string | null },
) {
  const { import_id } = (job.payload ?? {}) as { import_id?: string };

  if (!import_id || !job.company_id) throw new Error("import.parse: missing import_id/company_id");

  try {
    await admin
      .from("imports")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", import_id);

    const { data: servicesData } = await admin
      .from("services")
      .select("id, name, price")
      .eq("company_id", job.company_id)
      .eq("active", true);
    const activeServices = (servicesData ?? []) as Array<{ id: string; name: string; price: number }>;

    const { data: clientsData } = await admin
      .from("clients")
      .select("id, name")
      .eq("company_id", job.company_id);
    const companyClients = (clientsData ?? []) as Array<{ id: string; name: string }>;

    const { data: imp, error: impErr } = await admin
      .from("imports")
      .select("id, source, storage_path, company_id")
      .eq("id", import_id)
      .single();
    if (impErr || !imp) throw new Error(impErr?.message ?? "import not found");
    if (!imp.storage_path) throw new Error("import sem storage_path");

    const { data: file, error: dlErr } = await admin.storage
      .from("imports")
      .download(imp.storage_path);
    if (dlErr || !file) throw new Error(`download falhou: ${dlErr?.message}`);

    let rows: Record<string, unknown>[] = [];
    let headers: string[] = [];

    if (imp.source === "csv") {
      const text = await file.text();
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, delimiter: "" });
      const data = parsed.data as string[][];
      if (data.length === 0) throw new Error("CSV vazio");
      const hIdx = findHeaderRowIndex(data);
      headers = normalizeAndMapHeaders(data[hIdx]);
      rows = data.slice(hIdx + 1).map((r) => {
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
      const hIdx = findHeaderRowIndex(aoa);
      headers = normalizeAndMapHeaders(aoa[hIdx] as string[]);
      rows = aoa.slice(hIdx + 1).map((r) => {
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
      headers = normalizeAndMapHeaders(parsed.headers);
      rows = parsed.rows.map((r) => {
        const o: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          const origKey = parsed.headers[i];
          o[h] = r[origKey];
        });
        return o;
      });
    } else {
      throw new Error(`Fonte não suportada nesta fase: ${imp.source}`);
    }

    const cols = detectColumns(headers);
    const idx = (k: string) => (cols[k] !== undefined ? headers[cols[k]] : null);

    let total = 0,
      matched = 0,
      review = 0,
      failed = 0,
      revenue = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const nameFromCol = idx("name") ? String(r[idx("name")!] ?? "").trim() : "";
      const phoneRaw1 = idx("phone") ? String(r[idx("phone")!] ?? "").trim() : "";
      const phoneRaw2 = idx("phone2") ? String(r[idx("phone2")!] ?? "").trim() : "";
      const phoneRaw = phoneRaw1 || phoneRaw2;
      const description = idx("description") ? String(r[idx("description")!] ?? "").trim() : null;
      const amountRaw = parseAmount(idx("amount") ? r[idx("amount")!] : null);
      const occurred = parseDate(idx("date") ? r[idx("date")!] : null);
      const paymentMethod =
        (idx("payment") ? String(r[idx("payment")!] ?? "").trim() : null) ||
        detectPaymentMethod(description);

      let name = nameFromCol;
      let clientId: string | null = null;
      let clientFound = false;

      // Search description content to find the client name from the database (Brazilian bank statement match style)
      if (!name && description && companyClients.length > 0) {
        const descLower = description.toLowerCase();
        const sortedClients = [...companyClients].sort((a, b) => b.name.length - a.name.length);
        for (const client of sortedClients) {
          const clientNameLower = client.name.toLowerCase().trim();
          if (clientNameLower.length >= 4 && descLower.includes(clientNameLower)) {
            name = client.name;
            clientId = client.id;
            clientFound = true;
            break;
          }
        }
      }

      if (!clientFound && (name || phoneRaw)) {
        const { data: dup } = await admin.rpc("find_duplicate_client", {
          _company_id: job.company_id,
          _name: name || "",
          _phone: phoneRaw || "",
          _threshold: 0.7,
        });
        const first = Array.isArray(dup) ? dup[0] : null;
        if (first) {
          clientId = first.id;
          clientFound = true;
          if (!name) {
            name = first.name;
          }
        }
      }

      if (!name && description) {
        const extracted = extractNameFromDescription(description);
        if (extracted) {
          name = extracted;
        }
      }

      const isExpense = isExpenseDescription(description) || (amountRaw != null && amountRaw < 0);
      const amount = amountRaw != null ? Math.abs(amountRaw) : null;

      if (!name && !phoneRaw && amount == null) continue;
      total++;

      // Normalize phone via RPC for consistency with rest of system
      let phoneApi: string | null = null;
      if (phoneRaw1) {
        const { data: p } = await admin.rpc("normalize_phone", { _phone: phoneRaw1 });
        phoneApi = (p as string | null) ?? null;
      }
      let phoneApi2: string | null = null;
      if (phoneRaw2) {
        const { data: p } = await admin.rpc("normalize_phone", { _phone: phoneRaw2 });
        phoneApi2 = (p as string | null) ?? null;
      }

      // Offering prediction
      let offeringId: string | null = null;
      let offeringKind: string | null = null;
      let offeringLabel: string | null = null;
      let amountMatch = false;
      let descMatch = false;
      let tenantPattern = false;
      if (!isExpense && amount != null) {
        const { data: pred } = await admin.rpc("predict_offering_from_amount", {
          _company_id: job.company_id,
          _amount: amount,
        });
        const p = Array.isArray(pred) ? pred[0] : null;
        if (p?.entity_id) {
          offeringId = p.entity_id;
          offeringKind = p.entity_type;
          offeringLabel = p.label;
          amountMatch = true;
          if (p.reason === "kb_amount") tenantPattern = true;
        } else if (activeServices.length > 0) {
          const matchedCombination = findServiceCombination(amount, activeServices);
          if (matchedCombination && matchedCombination.length > 0) {
            offeringId = matchedCombination[0].id;
            offeringKind = "service";
            offeringLabel = matchedCombination.map((s) => s.name).join(" + ");
            amountMatch = true;
          }
        }
      }
      if (!isExpense && description) {
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
          descMatch = true;
          tenantPattern = true;
          if (!offeringId) {
            offeringId = kb.mapped_entity_id;
            offeringKind = kb.mapped_entity_type;
            offeringLabel = kb.mapped_label;
          }
        }
      }

      let confidence = 0;
      if (isExpense) {
        confidence = 95;
      } else {
        const hasHistory = clientFound;
        const { data: confData } = await admin.rpc("compute_import_confidence", {
          _client_found: clientFound,
          _amount_match: amountMatch,
          _desc_match: descMatch,
          _has_history: hasHistory,
          _tenant_pattern: tenantPattern,
        });
        confidence = (confData as number) ?? 0;
      }

      const status =
        confidence >= 95
          ? "matched"
          : confidence >= 70
            ? "review"
            : "manual";

      if (status === "matched") matched++;
      else if (status === "review") review++;

      // Retain only mapped columns for raw data
      const cleanRaw: Record<string, unknown> = {};
      for (const [key, index] of Object.entries(cols)) {
        const hName = headers[index];
        if (hName !== undefined) {
          cleanRaw[hName] = r[hName];
        }
      }

      const { error: rowErr } = await admin.from("import_rows").insert({
        import_id,
        company_id: job.company_id,
        row_index: i,
        raw: cleanRaw as never,
        parsed: {
          name,
          phoneRaw: phoneRaw1,
          phoneRaw2,
          description,
          amount,
          occurred,
          paymentMethod,
          isExpense,
        } as never,
        client_name: name || null,
        client_phone: phoneApi,
        client_phone2: phoneApi2,
        description,
        amount,
        occurred_at: occurred,
        payment_method: paymentMethod,
        resolved_client_id: clientId,
        resolved_offering_id: offeringId,
        resolved_offering_kind: offeringKind,
        confidence,
        status,
        notes: isExpense
          ? "Despesa automática detectada"
          : offeringLabel
            ? `Sugestão: ${offeringLabel}`
            : null,
      });
      if (rowErr) {
        failed++;
        await admin.from("import_errors").insert({
          import_id,
          company_id: job.company_id,
          code: "row_insert",
          message: rowErr.message,
        });
        continue;
      }

      if (amount && status === "matched" && !isExpense) revenue += Number(amount);
    }

    await admin
      .from("imports")
      .update({
        status: "completed",
        rows_total: total,
        rows_matched: matched,
        rows_review: review,
        rows_failed: failed,
        revenue_identified: revenue,
        finished_at: new Date().toISOString(),
      })
      .eq("id", import_id);

    return { total, matched, review, failed, revenue };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("imports")
      .update({
        status: "failed",
        last_error: msg,
        finished_at: new Date().toISOString(),
      })
      .eq("id", import_id);
    throw err;
  }
}

// ===================== SIE: import.apply_row =====================
async function runImportApplyRow(
  admin: Admin,
  job: { payload: Record<string, unknown> | null; company_id: string | null },
) {
  const { row_id, create_appointment } = (job.payload ?? {}) as {
    row_id?: string;
    create_appointment?: boolean;
  };
  if (!row_id) throw new Error("import.apply_row: missing row_id");

  const { data: row, error } = await admin
    .from("import_rows")
    .select("*")
    .eq("id", row_id)
    .single();
  if (error || !row) throw new Error(error?.message ?? "row not found");
  if (row.status === "applied") return { skipped: true };

  const companyId = row.company_id as string;

  const isExpense = isExpenseDescription(row.description);
  if (isExpense) {
    const { data: tx, error: txErr } = await admin
      .from("financial_transactions")
      .insert({
        company_id: companyId,
        type: "EXPENSE",
        category: "Despesa",
        description: row.description ?? "Despesa automática (import)",
        amount: row.amount ?? 0,
        transaction_date: row.occurred_at ?? new Date().toISOString().slice(0, 10),
        payment_method: row.payment_method ?? null,
      })
      .select("id")
      .single();
    if (txErr) throw new Error(`financial_transaction: ${txErr.message}`);
    const transactionId = tx.id;

    await admin
      .from("import_rows")
      .update({
        status: "applied",
        action_taken: "create_expense",
        transaction_id: transactionId,
      })
      .eq("id", row_id);

    await admin.from("import_matches").insert({
      import_id: row.import_id,
      company_id: companyId,
      row_id,
      entity_type: "financial_transaction",
      entity_id: transactionId,
      confidence: row.confidence,
      reason: "created_expense",
      action: "created",
    });

    const { data: cur } = await admin
      .from("imports")
      .select("transactions_created")
      .eq("id", row.import_id)
      .single();
    if (cur) {
      await admin
        .from("imports")
        .update({
          transactions_created: cur.transactions_created + 1,
        })
        .eq("id", row.import_id);
    }

    return { transactionId };
  }

  let clientId: string | null = row.resolved_client_id;
  let createdClient = false;

  if (!clientId && (row.client_name || row.client_phone || row.client_phone2)) {
    const { data: c, error: ce } = await admin
      .from("clients")
      .insert({
        company_id: companyId,
        name: row.client_name ?? "Cliente importado",
        phone: row.client_phone ?? null,
        phone2: row.client_phone2 ?? null,
        status: "ACTIVE",
        notes: "Criado pela importação",
      })
      .select("id")
      .single();
    if (ce) throw new Error(`cliente: ${ce.message}`);
    clientId = c.id;
    createdClient = true;
  }

  let appointmentId: string | null = null;
  let transactionId: string | null = null;

  if (clientId && row.amount && create_appointment !== false) {
    let serviceId = row.resolved_offering_kind === "service" ? row.resolved_offering_id : null;
    if (!serviceId) {
      const { data: fallbackService } = await admin
        .from("services")
        .select("id")
        .eq("company_id", companyId)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (fallbackService) {
        serviceId = fallbackService.id;
      }
    }

    if (!serviceId) {
      throw new Error("Não foi possível encontrar um serviço ativo para vincular ao agendamento");
    }

    const start = row.occurred_at ? new Date(`${row.occurred_at}T12:00:00Z`) : new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const { data: ap, error: ae } = await admin
      .from("appointments")
      .insert({
        company_id: companyId,
        client_id: clientId,
        service_id: serviceId,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        status: "COMPLETED",
        price: row.amount,
        source: "import",
        completed_at: start.toISOString(),
        notes: (() => {
          let n = row.description ?? "";
          if (row.notes && row.notes.startsWith("Sugestão:")) {
            n = n ? `${n} (${row.notes})` : row.notes;
          }
          return n || null;
        })(),
      })
      .select("id")
      .single();
    if (ae) throw new Error(`appointment: ${ae.message}`);
    appointmentId = ap.id;

    const { data: tx } = await admin
      .from("financial_transactions")
      .insert({
        company_id: companyId,
        type: "INCOME",
        category: "Importação",
        description: row.description ?? "Atendimento histórico (import)",
        amount: row.amount,
        transaction_date: row.occurred_at ?? new Date().toISOString().slice(0, 10),
        appointment_id: appointmentId,
        payment_method: row.payment_method ?? null,
      })
      .select("id")
      .maybeSingle();
    transactionId = tx?.id ?? null;
  }

  // IIL learning
  if (row.amount && row.resolved_offering_id) {
    await admin.rpc("learn_pattern", {
      _company_id: companyId,
      _type: "amount",
      _value: row.amount.toFixed(2),
      _entity_type: row.resolved_offering_kind,
      _entity_id: row.resolved_offering_id,
      _label: null,
      _delta: 1,
    });
  }
  if (row.description && row.resolved_offering_id) {
    await admin.rpc("learn_pattern", {
      _company_id: companyId,
      _type: "description",
      _value: row.description,
      _entity_type: row.resolved_offering_kind,
      _entity_id: row.resolved_offering_id,
      _label: null,
      _delta: 1,
    });
  }
  if (row.payment_method) {
    await admin
      .from("payment_behavior_profiles")
      .upsert(
        { company_id: companyId, payment_method: row.payment_method, hits: 1 },
        { onConflict: "company_id,payment_method", ignoreDuplicates: false },
      );
    await admin.rpc("learn_pattern", {
      _company_id: companyId,
      _type: "bank_description",
      _value: row.payment_method,
      _entity_type: null,
      _entity_id: null,
      _label: null,
      _delta: 1,
    });
  }
  if (clientId) await admin.rpc("refresh_client_behavior_profile", { _client_id: clientId });

  await admin
    .from("import_rows")
    .update({
      status: "applied",
      action_taken: createdClient ? "create_client" : "merge_client",
      resolved_client_id: clientId,
      appointment_id: appointmentId,
      transaction_id: transactionId,
    })
    .eq("id", row_id);

  await admin.from("import_matches").insert({
    import_id: row.import_id,
    company_id: companyId,
    row_id,
    entity_type: "client",
    entity_id: clientId,
    confidence: row.confidence,
    reason: createdClient ? "created" : "matched",
    action: createdClient ? "created" : "matched",
  });

  // Increment import counters
  if (createdClient || appointmentId || transactionId) {
    const { data: cur } = await admin
      .from("imports")
      .select("clients_created,appointments_created,transactions_created")
      .eq("id", row.import_id)
      .single();
    if (cur) {
      await admin
        .from("imports")
        .update({
          clients_created: cur.clients_created + (createdClient ? 1 : 0),
          appointments_created: cur.appointments_created + (appointmentId ? 1 : 0),
          transactions_created: cur.transactions_created + (transactionId ? 1 : 0),
        })
        .eq("id", row.import_id);
    }
  }

  return { clientId, appointmentId, transactionId, createdClient };
}
