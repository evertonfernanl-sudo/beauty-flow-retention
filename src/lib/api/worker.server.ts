import Papa from "papaparse";
import * as XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as path from "path";

let __filename = "";
let __dirname = "";

try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    __filename = fileURLToPath(import.meta.url);
    __dirname = dirname(__filename);
  } else {
    __dirname = process.cwd();
    __filename = path.join(__dirname, "worker.js");
  }
} catch (e) {
  __dirname = process.cwd();
  __filename = path.join(__dirname, "worker.js");
}

// @ts-ignore
globalThis.__dirname = __dirname;
// @ts-ignore
globalThis.__filename = __filename;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const MAX_PER_TICK = 20;

export async function runWorker(
  admin: Admin,
): Promise<Array<{ id: string; type: string; ok: boolean; error?: string }>> {
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
  description: /^(descri.*|hist.*|lan[cç].*|memo|complemento|obs|observa|servi[cç]o|produto)$/i,
  payment: /^(pagamento|payment|metodo|método|forma)$/i,
};

const isNameHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  if (norm.includes("label") || norm.includes("tipo")) {
    return false;
  }
  const exactNames = [
    "first name",
    "nome",
    "favorecido",
    "beneficiario",
    "beneficiário",
    "cliente",
    "fornecedor",
    "pagador",
    "recebedor",
    "sacado",
    "cedente",
    "contraparte",
    "nome favorecido",
    "nome cliente",
    "nome destinatario",
    "nome destinatário",
    "destinatario",
    "destinatário",
    "description",
    "receiver",
    "payee",
  ];
  if (exactNames.includes(norm)) return true;

  return (
    (norm.includes("nome") ||
      norm.includes("name") ||
      norm.includes("cliente") ||
      norm.includes("client") ||
      norm.includes("contato") ||
      norm.includes("customer")) &&
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
  if (
    norm.includes("label") ||
    norm.includes("tipo") ||
    norm.includes("descrição") ||
    norm.includes("descricao")
  ) {
    return false;
  }
  const exactPhones = [
    "phone 1 - value",
    "phone 2 - value",
    "telefone 1 - valor",
    "telefone 2 - valor",
    "telefone 1",
    "telefone 2",
    "phone 1",
    "phone 2",
  ];
  if (exactPhones.includes(norm)) return true;

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
  if (norm.includes("label") || norm.includes("tipo")) {
    return false;
  }
  const exactEmails = [
    "e-mail 1 - value",
    "email 1 - value",
    "e-mail 1",
    "email 1",
    "email 1 - valor",
    "e-mail 1 - valor",
  ];
  if (exactEmails.includes(norm)) return true;

  return (
    norm.includes("email") ||
    norm.includes("e-mail") ||
    (norm.includes("mail") && !norm.includes("name"))
  );
};

export const isCreditHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  const creditTerms = [
    "credito", "crédito", "entrada", "entradas", "recebido", "recebida", 
    "valor credito", "valor crédito", "credit", "credits", "deposit", "deposits"
  ];
  return creditTerms.includes(norm) || creditTerms.some(term => norm.includes(term));
};

export const isDebitHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  const debitTerms = [
    "debito", "débito", "saida", "saída", "saidas", "saídas", "pago", "pagamento", 
    "valor debito", "valor débito", "debit", "debits", "withdrawal", "withdrawals"
  ];
  return debitTerms.includes(norm) || debitTerms.some(term => norm.includes(term));
};

export const isAmountHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  const exactAmounts = [
    "valor",
    "valor r$",
    "valor (r$)",
    "valor movimento",
    "valor movimentado",
    "valor operação",
    "amount",
    "transaction amount",
    "valor da transacao",
    "valor da transação"
  ];
  if (exactAmounts.includes(norm)) return true;

  return (
    norm.includes("valor") ||
    norm.includes("preco") ||
    norm.includes("preço") ||
    norm.includes("price") ||
    norm.includes("amount") ||
    norm.includes("quantia") ||
    norm.includes("vlr")
  );
};

const isDateHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  const exactDates = [
    "data",
    "data mov",
    "data movimentacao",
    "data movimentação",
    "data lancamento",
    "data lançamento",
    "data operação",
    "data operacao",
    "data transacao",
    "data transação",
    "data documento",
    "dt movimento",
    "dt mov",
    "dt lançamento",
    "dt lancamento",
    "movement date",
    "transaction date",
  ];
  if (exactDates.includes(norm)) return true;

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
  const exactDescriptions = [
    "descricao",
    "descrição",
    "historico",
    "histórico",
    "historico/complemento",
    "histórico/complemento",
    "complemento",
    "detalhes",
    "detalhamento",
    "narrativa",
    "observacao",
    "observação",
    "descricao lancamento",
    "descrição lançamento",
    "historico transacao",
    "histórico transação",
    "transaction description",
    "memo",
  ];
  if (exactDescriptions.includes(norm)) return true;

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

const isBalanceHeader = (h: string): boolean => {
  const norm = h.toLowerCase().trim();
  return norm.includes("saldo") || norm.includes("balance");
};

function jsNormalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  let s = name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents
  s = s.toUpperCase();
  s = s.replace(/[^A-Z0-9 ]/g, " "); // replace non-alphanumeric with space
  s = s.replace(/\s+\b(DA|DE|DO|DAS|DOS|E)\b\s+/gi, " "); // remove Portuguese connectives
  s = s.replace(/\s+/g, " "); // collapse spaces
  return s.trim();
}

function findHeaderRowIndex(rows: unknown[][]): number {
  let bestIndex = 0;
  let maxMatches = 0;

  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    let matches = 0;
    row.forEach((cell) => {
      const cellStr = String(cell ?? "")
        .trim()
        .toLowerCase();
      if (!cellStr) return;

      if (
        isNameHeader(cellStr) ||
        isPhoneHeader(cellStr) ||
        isEmailHeader(cellStr) ||
        isAmountHeader(cellStr) ||
        isDateHeader(cellStr) ||
        isDescriptionHeader(cellStr) ||
        isPaymentHeader(cellStr) ||
        isCreditHeader(cellStr) ||
        isDebitHeader(cellStr) ||
        isBalanceHeader(cellStr)
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

export interface CanonicalColumnMap {
  date?: number;
  description?: number;
  beneficiary?: number;
  phone1?: number;
  phone2?: number;
  email?: number;
  credit?: number;
  debit?: number;
  amount?: number;
  balance?: number;
  payment?: number;
}

export function detectColumns(headers: string[]): CanonicalColumnMap {
  const out: CanonicalColumnMap = {};
  headers.forEach((h, i) => {
    const norm = (h ?? "").toString().trim().toLowerCase();

    if (out.beneficiary === undefined && (norm === "cliente" || isNameHeader(norm))) {
      out.beneficiary = i;
    }
    if (out.phone1 === undefined && (norm === "telefone 1" || isPhoneHeader(norm))) {
      out.phone1 = i;
    }
    if (
      out.phone2 === undefined &&
      (norm === "telefone 2" || (isPhoneHeader(norm) && i !== out.phone1))
    ) {
      out.phone2 = i;
    }
    if (out.email === undefined && isEmailHeader(norm)) {
      out.email = i;
    }
    if (out.credit === undefined && isCreditHeader(norm)) {
      out.credit = i;
    }
    if (out.debit === undefined && isDebitHeader(norm)) {
      out.debit = i;
    }
    if (out.amount === undefined && isAmountHeader(norm)) {
      out.amount = i;
    }
    if (out.date === undefined && isDateHeader(norm)) {
      out.date = i;
    }
    if (out.description === undefined && (norm === "descrição" || isDescriptionHeader(norm))) {
      out.description = i;
    }
    if (out.balance === undefined && isBalanceHeader(norm)) {
      out.balance = i;
    }
    if (out.payment === undefined && isPaymentHeader(norm)) {
      out.payment = i;
    }
  });
  return out;
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v * 100) / 100;
  const originalStr = String(v).trim();
  const isNegative =
    originalStr.startsWith("-") || (originalStr.startsWith("(") && originalStr.endsWith(")"));
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

export function parsePdfTextToRows(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  // Definição das Expressões Regulares de Data
  const fullDateRe = /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{2,4})\b/g;
  const isoDateRe = /\b(\d{4})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g;
  const dayMonthRe = /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])\b/g;
  const textMonthRe = /\b(0?[1-9]|[12]\d|3[01])\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(?:\s+(\d{2,4}))?\b/gi;
  
  // Regex refinada com lookahead negativo para evitar engolir a primeira letra de palavras como "Crédito"
  const amountRe = /(-?\s*R?\$?\s*\d+(?:\.\d{3})*,\d{2}(?:\s+[DdCc](?!\w))?)/g;

  // Pré-processamento 1: Limpeza estrutural de cabeçalhos e rodapés estáticos do Nubank
  let preparedText = text;
  
  // Remove rodapé institucional de suporte do Nubank
  preparedText = preparedText.replace(/Tem alguma dúvida\? Mande uma mensagem para nosso time de atendimento pelo chat do app ou ligue 4020 0185.*?Atendimento das 8h às 18h em dias úteis\./gi, "\n");
  
  // Remove linha de extrato gerado
  preparedText = preparedText.replace(/Extrato gerado dia \d{2} de [a-zA-Z]+ de \d{4} às \d{2}:\d{2}/gi, "\n");
  
  // Remove numeração de página (ex: 1 de 4, 2 de 4)
  preparedText = preparedText.replace(/\b\d+ de \d+\b/g, "\n");
  
  // Remove cabeçalhos de titular/conta do Nubank (suporta caracteres acentuados)
  preparedText = preparedText.replace(/[a-zA-ZÀ-ÿ\s]+ •••\.\d{3}\.\d{3}-••\s+\d*(?:CPF)?\s*Agência\s*Conta\s*\d+-\d+\s*a?\d*\s*DE\s+[a-zA-Z]+\s+DE\s+\d{4}\s+\d+\s+DE\s+[a-zA-Z]+\s+DE\s+\d{4}\s+VALORES EM\s*(?:R\$)?/gi, "\n");
  preparedText = preparedText.replace(/[a-zA-ZÀ-ÿ\s]+ •••\.\d{3}\.\d{3}-••\s+\d*(?:CPF)?\s*Agência\s*Conta\s*\d+-\d+/gi, "\n");

  // Pré-processamento 2: Inserir quebras de linha antes de datas e após valores monetários
  preparedText = preparedText.replace(textMonthRe, "\n$&");
  preparedText = preparedText.replace(fullDateRe, "\n$&");
  preparedText = preparedText.replace(isoDateRe, "\n$&");
  preparedText = preparedText.replace(amountRe, "$&\n");

  const rawLines = preparedText.split(/\r?\n/);
  const normalizedLines = rawLines
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  
  if (normalizedLines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseTextMonth = (m: string): string => {
    const map: Record<string, string> = {
      jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
      jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12"
    };
    return map[m.toLowerCase().substring(0, 3)] ?? "01";
  };

  const extractDate = (line: string): { dateStr: string; dateRaw: string; rest: string } | null => {
    const textMonthReLocal = /\b(0?[1-9]|[12]\d|3[01])\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(?:\s+(\d{2,4}))?\b/i;
    const fullDateReLocal = /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{2,4})\b/;
    const isoDateReLocal = /\b(\d{4})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/;
    const dayMonthReLocal = /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])\b/;

    let match = line.match(isoDateReLocal);
    if (match) {
      return { dateStr: match[0], dateRaw: match[0], rest: line.replace(match[0], " ").trim() };
    }
    
    match = line.match(fullDateReLocal);
    if (match) {
      return { dateStr: match[0], dateRaw: match[0], rest: line.replace(match[0], " ").trim() };
    }

    match = line.match(textMonthReLocal);
    if (match) {
      const day = match[1].padStart(2, "0");
      const monthStr = match[2];
      const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : new Date().getFullYear().toString();
      const monthNum = parseTextMonth(monthStr);
      const formatted = `${day}/${monthNum}/${year}`;
      return { dateStr: formatted, dateRaw: match[0], rest: line.replace(match[0], " ").trim() };
    }
    
    match = line.match(dayMonthReLocal);
    if (match) {
      const currentYear = new Date().getFullYear();
      return { dateStr: `${match[0]}/${currentYear}`, dateRaw: match[0], rest: line.replace(match[0], " ").trim() };
    }
    
    return null;
  };

  const extractAmount = (line: string): { amountStr: string; amountRaw: string; rest: string } | null => {
    const amountReGlobal = /(-?\s*R?\$?\s*\d+(?:\.\d{3})*(?:,\d{2}|\.\d{2})\b(?:\s+[DdCc]\b)?)/g;
    const matches = line.match(amountReGlobal);
    if (!matches || matches.length === 0) return null;
    
    // Filtra matches que são seguidos por % (taxas informativas de juros/porcentagem)
    const validMatches = matches.filter(m => {
      const idx = line.indexOf(m);
      if (idx === -1) return true;
      const after = line.slice(idx + m.length).trim();
      return !after.startsWith("%");
    });

    if (validMatches.length === 0) return null;
    
    const amountRaw = validMatches[0];
    let isNegative = false;
    if (amountRaw.includes("-") || /d/i.test(amountRaw)) {
      isNegative = true;
    }

    let cleanAmount = amountRaw
      .replace(/R?\$?\s*/gi, "")
      .replace(/[-+DcDdCc]/g, "")
      .trim();

    if (cleanAmount.includes(",")) {
      cleanAmount = cleanAmount.replace(/\./g, "").replace(",", ".");
    }

    const amountVal = parseFloat(cleanAmount);
    if (isNaN(amountVal)) return null;

    const finalVal = isNegative ? -Math.abs(amountVal) : amountVal;
    
    const amountStr = finalVal.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const rest = line.replace(amountRaw, " ").trim();
    return { amountStr, amountRaw, rest };
  };

  const isBalanceOrNoiseDescription = (desc: string): boolean => {
    const d = desc.toLowerCase().trim();
    if (!d) return true;
    
    const patterns = [
      /^(saldo|saldo anterior|saldo atual|saldo do dia|saldo disponível|saldo em conta|saldos diários|saldo final|saldo c\/c|saldo d\/c|saldo de transações|total|total de débitos|total de créditos|subtotal|limite|limite contratado|resumo do dia|movimentações)$/i,
      /^(extrato de conta|extrato consolidado|extrato período|período de|folha|página|pagina|cnpj|demonstrativo de tarifas|extrato de movimentações)$/i,
      /^(agencia|agência|conta|conta corrente|corrente|extrato mensal)$/i,
      /\btotal de (entradas|saídas)\b/i
    ];
    
    return patterns.some(p => p.test(d));
  };

  const isNoiseOrBalanceLine = (line: string): boolean => {
    const l = line.toLowerCase().trim();
    const balancePatterns = [
      /\b(saldo anterior|saldo atual|saldo do dia|saldo disponível|saldo em conta|saldos diários|saldo final|saldo c\/c|saldo d\/c|saldo de transações|resumo do dia|total de débitos|total de créditos|total de saídas|total de entradas|saldo consolidado|limite contratado|limite cheque especial|resumo do período|resumo do periodo)\b/i,
      /\b(extrato de conta|extrato consolidado|extrato período|período de|folha|página|pagina|cnpj|demonstrativo de tarifas|extrato de movimentações|extrato mensal)\b/i,
      /^(agência|agencia|conta corrente|conta poupança|conta poupanca|nº da conta|agência\/conta|agencia\/conta|agência e conta)\s*(:|-)?\s*\d+/i,
      /\b(tem alguma dúvida|mande uma mensagem|atendimento 24h|fale com a ouvidoria|ouvidoria em|nubank\.com\.br|extrato gerado dia|de 4|valores em r\$|valores em)\b/i,
      /\b(cpf|agência conta|agência\/conta|agencia\/conta|agência e conta)\b/i,
      /•••\.\d{3}\.\d{3}-••/i,
      /^[a-zA-ZÀ-ÿ\s]+ •••\.\d{3}\.\d{3}-••\s+0001CPF/i
    ];
    return balancePatterns.some((pattern) => pattern.test(l));
  };

  type LineEventType = "DATE" | "AMOUNT" | "DESCRIPTION" | "NOISE";
  interface LineEvent {
    type: LineEventType;
    payload?: any;
  }

  const metrics = {
    linesExtracted: normalizedLines.length,
    eventsDate: 0,
    eventsDescription: 0,
    eventsAmount: 0,
    eventsNoise: 0,
    transactionsGenerated: 0,
    csvRowsExported: 0
  };

  let currentDate = "";
  const rows: Record<string, unknown>[] = [];
  let lastTransaction: { data: string; descricao: string[]; valor: string } | null = null;

  for (const line of normalizedLines) {
    const hasDateCheck = extractDate(line);
    const hasAmountCheck = extractAmount(line);

    // Se for uma linha apenas de ruído (e sem data/valor), ignora
    if (isNoiseOrBalanceLine(line) && !hasDateCheck && !hasAmountCheck) {
      continue;
    }

    if (hasDateCheck) {
      currentDate = hasDateCheck.dateStr;
    }

    if (hasAmountCheck) {
      // Se já temos uma transação anterior acumulando, salva no array
      if (lastTransaction) {
        const parsedVal = parseFloat(lastTransaction.valor.replace(/\./g, "").replace(",", "."));
        const descJoined = lastTransaction.descricao.join(" ");
        const isNoise = isBalanceOrNoiseDescription(descJoined) || isNoiseOrBalanceLine(descJoined);
        
        if (parsedVal !== 0 || !isNoise) {
          rows.push({
            data: lastTransaction.data,
            descricao: descJoined,
            valor: lastTransaction.valor
          });
        }
      }

      // Inicia a nova transação
      let descText = line;
      if (hasDateCheck) {
        descText = descText.replace(hasDateCheck.dateStr, "");
      }
      descText = descText.replace(hasAmountCheck.amountRaw, "");
      
      // Limpa os cifrões e espaços múltiplos
      descText = descText.replace(/R\$\s*/gi, " ").replace(/\s+/g, " ").trim();

      lastTransaction = {
        data: currentDate,
        descricao: descText ? [descText] : [],
        valor: hasAmountCheck.amountStr
      };
      metrics.transactionsGenerated++;
    } else {
      // Se não tem valor de transação, ela é um complemento de descrição da transação anterior
      let descText = line;
      if (hasDateCheck) {
        descText = descText.replace(hasDateCheck.dateStr, "");
      }
      descText = descText.replace(/R\$\s*/gi, " ").replace(/\s+/g, " ").trim();

      if (descText && !isBalanceOrNoiseDescription(descText)) {
        if (lastTransaction) {
          lastTransaction.descricao.push(descText);
        }
      }
    }
  }

  // Não esquecer de empurrar a última transação pendente
  if (lastTransaction) {
    const parsedVal = parseFloat(lastTransaction.valor.replace(/\./g, "").replace(",", "."));
    const descJoined = lastTransaction.descricao.join(" ");
    const isNoise = isBalanceOrNoiseDescription(descJoined) || isNoiseOrBalanceLine(descJoined);
    
    if (parsedVal !== 0 || !isNoise) {
      rows.push({
        data: lastTransaction.data,
        descricao: descJoined,
        valor: lastTransaction.valor
      });
    }
  }

  metrics.csvRowsExported = rows.length;

  console.log("[Worker PDF Parser Metrics]:", JSON.stringify(metrics, null, 2));

  const headers = ["data", "descricao", "valor"];
  return { headers, rows };
}

function isExpenseDescription(desc: string | null | undefined): boolean {
  if (!desc) return false;
  const normalized = desc.trim().toLowerCase();
  return /^(pix\s+enviado|pix\s+para|transfer[êe]ncia\s+enviada|tarifa|compra|saque|pagamento\s+de\s+boleto|pagamento|juros|tributo|imposto|despesa)/i.test(
    normalized,
  );
}

export function extractNameFromDescription(desc: string | null | undefined): string | null {
  if (!desc) return null;

  const clean = desc.replace(/\s+/g, " ").trim();

  // 1) Common Pix/TED/Fornecedor prefixes with explicit name boundaries
  const regexes = [
    /p[ixle\s]+(?:qr\s+code\s+)?(?:estatic[o]?|dinamic[o]?)?.*?(?:des|rem)\s*:?\s*-?\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
    /(?:p[ixle\s]+recebido\s+de|p[ixle\s]+de|transferência\s+recebida\s+de|recebido\s+de|p[ixle\s]+recebido|ted\s+recebida|credito\s+p[ixle\s]+|transf\s+recebida|transferencia|ted|doc)\s*:?\s*-?\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
    /(?:p[ixle\s]+enviado\s+des\s*:|p[ixle\s]+enviado\s+para|p[ixle\s]+para|p[ixle\s]+enviado)\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
    /(?:recebimento\s+fornecedor\s+administradora\s+de\s+consorcio\s+naci|recebimento\s+fornecedor)\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
    /\b(bco:\d+\s+age:\d+\s+cta:[\d\-]+)\b/i,
    /(?:transf\s+saldo\s+c\/sal\s+p\/cc|transf|transferencia)\s*:?\s*-?\s*([A-Za-zÀ-ÿ0-9\s'\.\:\-/]{8,60})/i
  ];

  for (const re of regexes) {
    const match = clean.match(re);
    if (match) {
      const candidate = match[1].trim();
      const words = candidate.split(/\s+/).filter((w) => w.length >= 2);
      const blacklist =
        /^(pix|ted|doc|tarifa|compra|saque|pagamento|recebido|transferencia|itau|bradesco|caixa|nubank|banco|itaucard|saldo|extrato|juros|tributo|mensalidade|taxa|retirada|deposito)$/i;
      const validWords = words.filter((w) => !blacklist.test(w));
      if (validWords.length >= 2) {
        return validWords.join(" ");
      }
    }
  }

  // 2) Split by "-" if present (very common in Brazilian statements, e.g. "PIX RECEBIDO - MARIA SILVA")
  const parts = clean
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

  // 3) Fallback: if it's a simple line with 2 to 4 capitalized words, e.g. "MARIA SILVA"
  const words = clean.split(/\s+/);
  if (words.length >= 2 && words.length <= 4) {
    const nameRegex = /^[A-Za-zÀ-ÿ\s'\.\-]+$/;
    const excludeKeywords =
      /(transfer[êe]ncia|recebido|recebida|enviado|enviada|pix|ted|doc|pagamento|compra|saque|dep[óo]sito|tarifa|juros|saldo|extrato|ag[êe]ncia|conta|nu\s+pagamentos|nubank|ita[úu]|bradesco|santander|caixa|banco|pagseguro|stone|picpay|mercado\s+pago|inter|original)/i;

    if (nameRegex.test(clean) && !excludeKeywords.test(clean)) {
      const validWords = words.filter((w) => w.length >= 2);
      if (validWords.length >= 2) {
        return clean;
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
  const cleanHeaders = rawHeaders.map((h) => String(h ?? "").trim());
  const lowerHeaders = cleanHeaders.map((h) => h.toLowerCase());

  let nameIndex = lowerHeaders.findIndex(
    (h) => h === "nome" || h === "name" || h === "cliente" || h === "client",
  );
  if (nameIndex === -1) {
    nameIndex = lowerHeaders.findIndex((h) => isNameHeader(h));
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

  const descIndex = lowerHeaders.findIndex((h) => isDescriptionHeader(h));

  return cleanHeaders.map((h, i) => {
    if (i === nameIndex) return "cliente";
    if (i === phone1Index) return "telefone 1";
    if (i === phone2Index) return "telefone 2";
    if (i === descIndex) return "descrição";
    return h;
  });
}

function matchSpecialTransaction(desc: string | null | undefined): "APLICACAO" | "RESGATE" | "INTERNA" | "TARIFA" | "JUROS" | null {
  if (!desc) return null;
  const s = desc.toLowerCase().trim();
  
  const aplicacaoKeywords = [
    "aplicacao", "aplicação", "dinheiro aplicado", "guardar na caixinha", 
    "guardar dinheiro", "investimento automatico", "investimento automático", 
    "transferencia para cofrinho", "transferência para cofrinho",
    "transferencia para investimento", "transferência para investimento", 
    "mover para reserva", "saldo aplicado", "aplicacao poupanca", "aplicação poupança", 
    "aplicacao investimento", "aplicação investimento", "debit investment", 
    "investment deposit", "funds allocation", "cash allocation", "aplicacao cdb", 
    "aplicação cdb", "aplicacao rdb", "aplicação rdb", "aplicacao fundos", "aplicação fundos",
    "aplicacao renda fixa", "aplicação renda fixa"
  ];
  if (aplicacaoKeywords.some(kw => s.includes(kw))) {
    return "APLICACAO";
  }
  
  const resgateKeywords = [
    "resgate", "dinheiro retirado", "retirado da caixinha", "retirada do cofrinho", 
    "retirada caixinha", "transferencia da reserva", "transferência da reserva", 
    "resgate automatico", "resgate automático", "resgate rdb", "resgate cdb", 
    "resgate caixinha"
  ];
  if (resgateKeywords.some(kw => s.includes(kw))) {
    return "RESGATE";
  }
  
  const internaKeywords = [
    "transferencia entre contas", "transferência entre contas", 
    "movimentacao interna", "movimentação interna", 
    "transferencia interna", "transferência interna", 
    "mesmo titular", "transf entre contas", "transf. entre contas"
  ];
  if (internaKeywords.some(kw => s.includes(kw))) {
    return "INTERNA";
  }
  
  const tarifaKeywords = [
    "tarifa", "taxa", "mensalidade", "pacote de servicos", "pacote de serviços", 
    "anuidade", "tarifa pix", "tarifa ted", "tarifa doc", "custo de transacao", 
    "custo de transação", "debit fee", "bank fee"
  ];
  if (tarifaKeywords.some(kw => s.includes(kw))) {
    return "TARIFA";
  }
  
  const jurosKeywords = [
    "juros", "rendimento", "remuneracao", "remuneração", "juros sobre capital", 
    "rendimentos caixinha", "receita de juros", "rendimento caixinha", 
    "rendimento conta", "interest earned"
  ];
  if (jurosKeywords.some(kw => s.includes(kw))) {
    return "JUROS";
  }
  
  return null;
}

function inferBankName(filename: string | null | undefined, description: string | null | undefined): string {
  const name = (filename ?? "").toLowerCase();
  const desc = (description ?? "").toLowerCase();
  
  if (name.includes("itau") || name.includes("itaú") || desc.includes("itau") || desc.includes("itaú")) return "Itaú";
  if (name.includes("nubank") || name.includes("nu ") || name.includes("nu_") || desc.includes("nubank")) return "Nubank";
  if (name.includes("bradesco") || desc.includes("bradesco")) return "Bradesco";
  if (name.includes("inter") || desc.includes("inter")) return "Banco Inter";
  if (name.includes("santander") || desc.includes("santander")) return "Santander";
  if (name.includes("caixa") || name.includes("cef") || desc.includes("caixa") || desc.includes("cef")) return "Caixa Econômica";
  if (name.includes("brasil") || name.includes("bb") || desc.includes("brasil") || desc.includes("bb")) return "Banco do Brasil";
  if (name.includes("c6") || desc.includes("c6")) return "C6 Bank";
  if (name.includes("stone") || desc.includes("stone")) return "Stone";
  if (name.includes("pagseguro") || name.includes("pagbank") || desc.includes("pagseguro") || desc.includes("pagbank")) return "PagBank";
  if (name.includes("picpay") || desc.includes("picpay")) return "PicPay";
  if (name.includes("mercado pago") || name.includes("mercadopago") || desc.includes("mercado pago") || desc.includes("mercadopago")) return "Mercado Pago";
  
  return "Banco Importado";
}

export async function extractFullTextFromPdfBuffer(buf: Uint8Array, filename: string): Promise<string> {
  const { extractText, getDocumentProxy, extractImages } = await import("unpdf");
  const { PipelineError } = await import("./ocr-normalizer.server");
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  let fullText = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  
  if (!fullText.trim()) {
    console.log("PDF sem camada de texto detectada. Iniciando extração OCR via Lovable AI Gateway (Gemini).");
    
    let ocrTextAccumulator = "";
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new PipelineError("IA indisponível para OCR: LOVABLE_API_KEY ausente no ambiente de produção.", "OCR");
    }
    
    try {
      const resizeImageRGBA = (rgbaData: Uint8ClampedArray, width: number, height: number, maxDim = 950) => {
        if (width <= maxDim && height <= maxDim) {
          return { data: rgbaData, width, height };
        }
        const scale = Math.min(maxDim / width, maxDim / height);
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);
        const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
        for (let y = 0; y < newHeight; y++) {
          const srcY = Math.min(Math.floor(y / scale), height - 1);
          for (let x = 0; x < newWidth; x++) {
            const srcX = Math.min(Math.floor(x / scale), width - 1);
            const dstIdx = (y * newWidth + x) * 4;
            const srcIdx = (srcY * width + srcX) * 4;
            newData[dstIdx] = rgbaData[srcIdx];
            newData[dstIdx + 1] = rgbaData[srcIdx + 1];
            newData[dstIdx + 2] = rgbaData[srcIdx + 2];
            newData[dstIdx + 3] = rgbaData[srcIdx + 3];
          }
        }
        return { data: newData, width: newWidth, height: newHeight };
      };

      const convertToBMP32 = (rgbaData: Uint8ClampedArray, width: number, height: number) => {
        const fileHeaderSize = 14;
        const dibHeaderSize = 40;
        const headerSize = fileHeaderSize + dibHeaderSize;
        const imageSize = width * height * 4;
        const fileSize = headerSize + imageSize;
        const buffer = Buffer.alloc(fileSize);
        
        buffer.write("BM", 0);
        buffer.writeUInt32LE(fileSize, 2);
        buffer.writeUInt32LE(0, 6);
        buffer.writeUInt32LE(headerSize, 10);
        
        buffer.writeUInt32LE(dibHeaderSize, 14);
        buffer.writeInt32LE(width, 18);
        buffer.writeInt32LE(-height, 22);
        buffer.writeUInt16LE(1, 26);
        buffer.writeUInt16LE(32, 28);
        buffer.writeUInt32LE(0, 30);
        buffer.writeUInt32LE(imageSize, 34);
        buffer.writeInt32LE(2835, 38);
        buffer.writeInt32LE(2835, 42);
        buffer.writeUInt32LE(0, 46);
        buffer.writeUInt32LE(0, 50);
        
        let dstIdx = headerSize;
        for (let srcIdx = 0; srcIdx < rgbaData.length; srcIdx += 4) {
          buffer[dstIdx] = rgbaData[srcIdx + 2];
          buffer[dstIdx + 1] = rgbaData[srcIdx + 1];
          buffer[dstIdx + 2] = rgbaData[srcIdx];
          buffer[dstIdx + 3] = rgbaData[srcIdx + 3];
          dstIdx += 4;
        }
        return buffer;
      };

      for (let i = 1; i <= pdf.numPages; i++) {
        const pageImages = await extractImages(pdf, i);
        if (pageImages && pageImages.length > 0) {
          for (let idx = 0; idx < pageImages.length; idx++) {
            const img = pageImages[idx];
            const convertToRGBA = (image: any) => {
              const { data: imgData, width: w, height: h, channels: ch } = image;
              if (ch === 4) {
                return { data: new Uint8ClampedArray(imgData), width: w, height: h };
              }
              
              const rgbaData = new Uint8ClampedArray(w * h * 4);
              let srcIdx = 0;
              let dstIdx = 0;
              
              for (let p = 0; p < w * h; p++) {
                if (ch === 3) {
                  rgbaData[dstIdx] = imgData[srcIdx];
                  rgbaData[dstIdx + 1] = imgData[srcIdx + 1];
                  rgbaData[dstIdx + 2] = imgData[srcIdx + 2];
                  rgbaData[dstIdx + 3] = 255;
                  srcIdx += 3;
                } else if (ch === 1) {
                  const val = imgData[srcIdx];
                  rgbaData[dstIdx] = val;
                  rgbaData[dstIdx + 1] = val;
                  rgbaData[dstIdx + 2] = val;
                  rgbaData[dstIdx + 3] = 255;
                  srcIdx += 1;
                }
                dstIdx += 4;
              }
              return { data: rgbaData, width: w, height: h };
            };

            const rgbaImg = convertToRGBA(img);
            const resizedImg = resizeImageRGBA(rgbaImg.data, rgbaImg.width, rgbaImg.height, 950);
            const bmpBuffer = convertToBMP32(resizedImg.data, resizedImg.width, resizedImg.height);
            
            const base64Bmp = bmpBuffer.toString("base64");
            const dataUrl = `data:image/bmp;base64,${base64Bmp}`;

            console.log(`Enviando página ${i} imagem ${idx} para Lovable AI Gateway...`);
            const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Você é um motor de OCR de altíssima precisão para extratos bancários. Transcreva integralmente todo o texto visível desta imagem do extrato. Preserve exatamente a ordem das linhas e dos dados (datas, descrições de transações e valores com cifrão). Não faça comentários nem introduza explicações adicionais, retorne apenas o texto transcrito cru."
                      },
                      {
                        type: "image_url",
                        image_url: {
                          url: dataUrl
                        }
                      }
                    ]
                  }
                ]
              })
            });

            if (!aiRes.ok) {
              const errText = await aiRes.text();
              throw new Error(`Erro no AI Gateway (${aiRes.status}): ${errText.slice(0, 200)}`);
            }

            const aiJson = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
            const pageText = aiJson.choices?.[0]?.message?.content ?? "";
            if (pageText) {
              ocrTextAccumulator += pageText + "\n";
            }
          }
        }
      }
    } catch (ocrErr: any) {
      console.error("Falha durante execução do OCR multimodal:", ocrErr.message);
      throw new PipelineError(`Falha no OCR multimodal via AI Gateway: ${ocrErr.message}`, "OCR");
    }
    
    const { normalizeOcrText, validateOcrText } = await import("./ocr-normalizer.server");
    const cleanText = normalizeOcrText(ocrTextAccumulator);
    try {
      validateOcrText(cleanText, ocrTextAccumulator);
    } catch (valErr: any) {
      throw new PipelineError(valErr.message, "VALIDATOR");
    }
    fullText = cleanText;
  }

  if (!fullText.trim()) {
    throw new PipelineError("Não foi possível extrair nenhum texto legível do PDF (PDF sem camada nativa e OCR falhou).", "OCR");
  }
  return fullText;
}

export async function convertPdfBufferToCsvForImport(buf: Uint8Array, filename: string): Promise<string> {
  const { PipelineError } = await import("./ocr-normalizer.server");
  const fullText = await extractFullTextFromPdfBuffer(buf, filename);
  const parsedPdf = parsePdfTextToRows(fullText);
  if (parsedPdf.rows.length === 0) {
    throw new PipelineError("Nenhuma linha de extrato identificada no PDF", "PARSER");
  }
  return Papa.unparse({
    fields: parsedPdf.headers,
    data: parsedPdf.rows.map((r) => parsedPdf.headers.map((h) => r[h] ?? "")),
  });
}

export async function convertPdfBufferToCsvRaw(buf: Uint8Array, filename: string): Promise<string> {
  const { getDocumentProxy, extractImages } = await import("unpdf");
  const { PipelineError } = await import("./ocr-normalizer.server");
  const pdf = await getDocumentProxy(buf);
  
  // 1. Tentar extração nativa por coordenadas físicas e estruturação via Gemini (para PDFs nativos)
  let nativePagesText: string[] = [];
  let isNative = false;
  
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];
      
      if (items && items.length > 0) {
        isNative = true;
        
        // Agrupar itens por coordenada Y para preservar o layout original de linhas/colunas
        const yThreshold = 5;
        const rowsMap: { y: number; items: typeof items }[] = [];
        
        for (const item of items) {
          if (!item.str) continue;
          const y = item.transform ? item.transform[5] : 0;
          let foundRow = rowsMap.find(r => Math.abs(r.y - y) <= yThreshold);
          if (foundRow) {
            foundRow.items.push(item);
          } else {
            rowsMap.push({ y, items: [item] });
          }
        }
        
        // Ordenar linhas do topo para o rodapé (Y decrescente)
        rowsMap.sort((a, b) => b.y - a.y);
        
        let pageText = "";
        for (const row of rowsMap) {
          // Ordenar itens da esquerda para a direita (X crescente)
          row.items.sort((a, b) => (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0));
          
          let line = "";
          let lastXEnd = -1;
          for (const item of row.items) {
            const x = item.transform ? item.transform[4] : 0;
            const height = item.height || 10;
            const itemWidth = item.width || (item.str.length * (height * 0.6));
            
            if (lastXEnd === -1) {
              line = item.str;
            } else {
              const spacing = x - lastXEnd;
              if (spacing > 12) {
                line += "\t" + item.str; // Tabulação indica separação física de coluna
              } else {
                line += (spacing > 2 ? " " : "") + item.str;
              }
            }
            lastXEnd = x + itemWidth;
          }
          pageText += line + "\n";
        }
        
        if (pageText.trim()) {
          nativePagesText.push(pageText);
        }
      }
    }
  } catch (err) {
    console.error("Erro na extração de texto nativo por coordenadas:", err);
  }
  
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new PipelineError("IA indisponível para OCR: LOVABLE_API_KEY ausente no ambiente de produção.", "OCR");
  }

  if (isNative && nativePagesText.length > 0) {
    console.log("PDF Nativo detectado. Enviando texto estruturado para formatação CSV via Gemini...");
    let nativeCsvAccumulator = "";
    
    for (let i = 0; i < nativePagesText.length; i++) {
      const pageTextContent = nativePagesText[i];
      console.log(`Enviando página nativa ${i + 1} para o AI Gateway para formatação CSV...`);
      
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Você é um especialista em estruturação de dados e reconstrução de tabelas. Sua tarefa é converter o texto de extrato bancário fornecido abaixo diretamente no formato CSV. O texto original foi extraído de um PDF nativo e preserva as quebras de linha e colunas (separadas por tabulação '\\t' ou múltiplos espaços). Identifique a estrutura física das tabelas e alinhe corretamente as informações em colunas correspondentes do CSV (como Data, Descrição, Documento, Valor, Saldo, etc.). Certifique-se de que cada registro ocupe uma única linha do CSV com todas as suas respectivas colunas preenchidas. Não resuma, não ignore linhas, não modifique os textos/valores originais e não aplique nenhuma regra de negócio. Retorne APENAS o código do CSV válido, sem blocos de código markdown (como ```csv), sem explicações e sem comentários.\n\nTexto original:\n" + pageTextContent
                }
              ]
            }
          ]
        })
      });
      
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`Erro no AI Gateway (${aiRes.status}): ${errText.slice(0, 200)}`);
      }
      
      const aiJson = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
      let pageCsv = aiJson.choices?.[0]?.message?.content ?? "";
      
      pageCsv = pageCsv.trim();
      if (pageCsv.startsWith("```")) {
        pageCsv = pageCsv.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
      }
      
      if (pageCsv) {
        nativeCsvAccumulator += pageCsv + "\n";
      }
    }
    
    return nativeCsvAccumulator;
  }
  
  // 2. Fallback para Gemini OCR estruturado em CSV para PDFs escaneados (imagens)
  console.log("PDF sem camada nativa ou extração falhou. Iniciando OCR Gemini estruturado para CSV...");
  
  let ocrCsvAccumulator = "";
  if (!apiKey) {
    throw new PipelineError("IA indisponível para OCR: LOVABLE_API_KEY ausente no ambiente de produção.", "OCR");
  }
  
  try {
    const resizeImageRGBA = (rgbaData: Uint8ClampedArray, width: number, height: number, maxDim = 950) => {
      if (width <= maxDim && height <= maxDim) {
        return { data: rgbaData, width, height };
      }
      const scale = Math.min(maxDim / width, maxDim / height);
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);
      const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
      for (let y = 0; y < newHeight; y++) {
        const srcY = Math.min(Math.floor(y / scale), height - 1);
        for (let x = 0; x < newWidth; x++) {
          const srcX = Math.min(Math.floor(x / scale), width - 1);
          const dstIdx = (y * newWidth + x) * 4;
          const srcIdx = (srcY * width + srcX) * 4;
          newData[dstIdx] = rgbaData[srcIdx];
          newData[dstIdx + 1] = rgbaData[srcIdx + 1];
          newData[dstIdx + 2] = rgbaData[srcIdx + 2];
          newData[dstIdx + 3] = rgbaData[srcIdx + 3];
        }
      }
      return { data: newData, width: newWidth, height: newHeight };
    };

    const convertToBMP32 = (rgbaData: Uint8ClampedArray, width: number, height: number) => {
      const fileHeaderSize = 14;
      const dibHeaderSize = 40;
      const headerSize = fileHeaderSize + dibHeaderSize;
      const imageSize = width * height * 4;
      const fileSize = headerSize + imageSize;
      const buffer = Buffer.alloc(fileSize);
      
      buffer.write("BM", 0);
      buffer.writeUInt32LE(fileSize, 2);
      buffer.writeUInt32LE(0, 6);
      buffer.writeUInt32LE(headerSize, 10);
      
      buffer.writeUInt32LE(dibHeaderSize, 14);
      buffer.writeInt32LE(width, 18);
      buffer.writeInt32LE(-height, 22);
      buffer.writeUInt16LE(1, 26);
      buffer.writeUInt16LE(32, 28);
      buffer.writeUInt32LE(0, 30);
      buffer.writeUInt32LE(imageSize, 34);
      buffer.writeInt32LE(2835, 38);
      buffer.writeInt32LE(2835, 42);
      buffer.writeUInt32LE(0, 46);
      buffer.writeUInt32LE(0, 50);
      
      let dstIdx = headerSize;
      for (let srcIdx = 0; srcIdx < rgbaData.length; srcIdx += 4) {
        buffer[dstIdx] = rgbaData[srcIdx + 2];
        buffer[dstIdx + 1] = rgbaData[srcIdx + 1];
        buffer[dstIdx + 2] = rgbaData[srcIdx];
        buffer[dstIdx + 3] = rgbaData[srcIdx + 3];
        dstIdx += 4;
      }
      return buffer;
    };

    for (let i = 1; i <= pdf.numPages; i++) {
      const pageImages = await extractImages(pdf, i);
      if (pageImages && pageImages.length > 0) {
        for (let idx = 0; idx < pageImages.length; idx++) {
          const img = pageImages[idx];
          const convertToRGBA = (image: any) => {
            const { data: imgData, width: w, height: h, channels: ch } = image;
            if (ch === 4) {
              return { data: new Uint8ClampedArray(imgData), width: w, height: h };
            }
            
            const rgbaData = new Uint8ClampedArray(w * h * 4);
            let srcIdx = 0;
            let dstIdx = 0;
            
            for (let p = 0; p < w * h; p++) {
              if (ch === 3) {
                rgbaData[dstIdx] = imgData[srcIdx];
                rgbaData[dstIdx + 1] = imgData[srcIdx + 1];
                rgbaData[dstIdx + 2] = imgData[srcIdx + 2];
                rgbaData[dstIdx + 3] = 255;
                srcIdx += 3;
              } else if (ch === 1) {
                const val = imgData[srcIdx];
                rgbaData[dstIdx] = val;
                rgbaData[dstIdx + 1] = val;
                rgbaData[dstIdx + 2] = val;
                rgbaData[dstIdx + 3] = 255;
                srcIdx += 1;
              }
              dstIdx += 4;
            }
            return { data: rgbaData, width: w, height: h };
          };

          const rgbaImg = convertToRGBA(img);
          const resizedImg = resizeImageRGBA(rgbaImg.data, rgbaImg.width, rgbaImg.height, 950);
          const bmpBuffer = convertToBMP32(resizedImg.data, resizedImg.width, resizedImg.height);
          
          const base64Bmp = bmpBuffer.toString("base64");
          const dataUrl = `data:image/bmp;base64,${base64Bmp}`;

          console.log(`Enviando página ${i} imagem ${idx} para Lovable AI Gateway para conversão CSV...`);
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Você é um analisador de documentos especialista em reconstruir tabelas. Sua tarefa é transcrever todo o conteúdo visível nesta imagem de extrato bancário diretamente no formato CSV. Não faça qualquer tipo de interpretação de dados, não resuma, não limpe e não aplique regras de negócio. Apenas identifique a estrutura física (tabelas, linhas e colunas) existente na imagem e monte um CSV correspondente. Se a imagem contiver textos fora de tabelas, represente-os como linhas de uma única célula no CSV. Retorne APENAS o código do CSV válido, sem blocos de código markdown (como ```csv), sem explicações e sem comentários."
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: dataUrl
                      }
                    }
                  ]
                }
              ]
            })
          });

          if (!aiRes.ok) {
            const errText = await aiRes.text();
            throw new Error(`Erro no AI Gateway (${aiRes.status}): ${errText.slice(0, 200)}`);
          }

          const aiJson = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
          let pageText = aiJson.choices?.[0]?.message?.content ?? "";
          
          pageText = pageText.trim();
          if (pageText.startsWith("```")) {
            pageText = pageText.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
          }
          
          if (pageText) {
            ocrCsvAccumulator += pageText + "\n";
          }
        }
      }
    }
  } catch (ocrErr: any) {
    console.error("Falha durante execução do OCR multimodal para CSV:", ocrErr.message);
    throw new PipelineError(`Falha no OCR multimodal via AI Gateway: ${ocrErr.message}`, "OCR");
  }
  
  if (!ocrCsvAccumulator.trim()) {
    throw new PipelineError("Não foi possível extrair nenhuma tabela estruturada do PDF.", "OCR");
  }
  
  return ocrCsvAccumulator;
}

export async function runImportParse(
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
    const activeServices = (servicesData ?? []) as Array<{
      id: string;
      name: string;
      price: number;
    }>;

    const { data: clientsData } = await admin
      .from("clients")
      .select("id, name")
      .eq("company_id", job.company_id);
    const companyClients = (clientsData ?? []) as Array<{ id: string; name: string }>;

    const { PipelineError } = await import("./ocr-normalizer.server");

    const { data: imp, error: impErr } = await admin
      .from("imports")
      .select("id, source, storage_path, company_id, filename")
      .eq("id", import_id)
      .single();
    if (impErr || !imp) throw new PipelineError(impErr?.message ?? "import not found", "INITIALIZATION");
    if (!imp.storage_path) throw new PipelineError("import sem storage_path", "INITIALIZATION");

    const { data: file, error: dlErr } = await admin.storage
      .from("imports")
      .download(imp.storage_path);
    if (dlErr || !file) throw new PipelineError(`download falhou: ${dlErr?.message}`, "DOWNLOAD");

    // Camada 1 — Leitura
    let rawMatrix: unknown[][] = [];

    if (imp.source === "csv" || imp.source === "pdf") {
      let csvText = "";
      if (imp.source === "csv") {
        csvText = await file.text();
      } else {
        const buf = new Uint8Array(await file.arrayBuffer());
        csvText = await convertPdfBufferToCsvForImport(buf, imp.filename || "extrato.pdf");
      }

      const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true, delimiter: "" });
      rawMatrix = parsed.data;
    } else if (imp.source === "xlsx") {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: null,
      });
      rawMatrix = aoa;
    } else {
      throw new Error(`Fonte não suportada nesta fase: ${imp.source}`);
    }

    if (rawMatrix.length === 0) throw new Error("Arquivo de importação vazio");

    // Camada 2 — Mapeamento de Cabeçalhos
    const hIdx = findHeaderRowIndex(rawMatrix);
    const rawHeaders = (rawMatrix[hIdx] ?? []).map((h) => String(h ?? "").trim());
    const normalizedHeaders = normalizeAndMapHeaders(rawHeaders);
    const cols = detectColumns(normalizedHeaders);

    // Camada 3 — Modelo Canônico
    interface CanonicalRow {
      date: unknown;
      description: unknown;
      beneficiary: unknown;
      phone1: unknown;
      phone2: unknown;
      email: unknown;
      credit: unknown;
      debit: unknown;
      amount: unknown;
      balance: unknown;
      payment: unknown;
      rawRecord: Record<string, unknown>;
    }

    const canonicalRows: CanonicalRow[] = [];
    const dataRows = rawMatrix.slice(hIdx + 1);

    for (const r of dataRows) {
      if (!r || !Array.isArray(r)) continue;

      const rawRecord: Record<string, unknown> = {};
      const colIndices = Object.values(cols).filter((idx): idx is number => idx !== undefined);
      colIndices.forEach((index) => {
        const hName = normalizedHeaders[index];
        if (hName !== undefined) {
          rawRecord[hName] = r[index];
        }
      });

      canonicalRows.push({
        date: cols.date !== undefined ? r[cols.date] : null,
        description: cols.description !== undefined ? r[cols.description] : null,
        beneficiary: cols.beneficiary !== undefined ? r[cols.beneficiary] : null,
        phone1: cols.phone1 !== undefined ? r[cols.phone1] : null,
        phone2: cols.phone2 !== undefined ? r[cols.phone2] : null,
        email: cols.email !== undefined ? r[cols.email] : null,
        credit: cols.credit !== undefined ? r[cols.credit] : null,
        debit: cols.debit !== undefined ? r[cols.debit] : null,
        amount: cols.amount !== undefined ? r[cols.amount] : null,
        balance: cols.balance !== undefined ? r[cols.balance] : null,
        payment: cols.payment !== undefined ? r[cols.payment] : null,
        rawRecord,
      });
    }

    // Camada 4 — Interpretador Financeiro & Camada 5 — Importador
    let total = 0,
      matched = 0,
      review = 0,
      failed = 0,
      revenue = 0,
      autoAppliedCount = 0;

    for (let i = 0; i < canonicalRows.length; i++) {
      const canonical = canonicalRows[i];

      const description = canonical.description ? String(canonical.description).trim() : null;
      const balanceVal = canonical.balance !== null && canonical.balance !== undefined ? parseAmount(canonical.balance) : null;
      
      const isSaldoDesc = description && /^(saldo|saldo do dia|saldo dia|saldo anterior|saldo atual|saldo final|resumo do dia|total de|subtotal)/i.test(description.trim());
      
      let amountRaw: number | null = null;
      const creditVal = canonical.credit !== null && canonical.credit !== undefined ? parseAmount(canonical.credit) : null;
      const debitVal = canonical.debit !== null && canonical.debit !== undefined ? parseAmount(canonical.debit) : null;
      const amountVal = canonical.amount !== null && canonical.amount !== undefined ? parseAmount(canonical.amount) : null;

      if (creditVal !== null && creditVal !== 0 && !isNaN(creditVal)) {
        amountRaw = Math.abs(creditVal);
      } else if (debitVal !== null && debitVal !== 0 && !isNaN(debitVal)) {
        amountRaw = -Math.abs(debitVal);
      } else if (amountVal !== null && amountVal !== 0 && !isNaN(amountVal)) {
        amountRaw = amountVal;
      }

      if (amountRaw === 0 || amountRaw === null || isSaldoDesc || (description === null && balanceVal !== null && amountRaw === null)) {
        continue;
      }

      const specialCat = matchSpecialTransaction(description);

      let isExpense = false;
      if (specialCat === "TARIFA" || specialCat === "APLICACAO") {
        isExpense = true;
      } else if (specialCat === "JUROS" || specialCat === "RESGATE") {
        isExpense = false;
      } else {
        if (creditVal !== null && creditVal !== 0 && !isNaN(creditVal)) {
          isExpense = false;
        } else if (debitVal !== null && debitVal !== 0 && !isNaN(debitVal)) {
          isExpense = true;
        } else {
          isExpense = isExpenseDescription(description) || (amountRaw !== null && amountRaw < 0);
        }
      }

      const amount = amountRaw !== null ? Math.abs(amountRaw) : null;
      let name = "";
      const nameFromCol = canonical.beneficiary ? String(canonical.beneficiary).trim() : "";
      
      if (nameFromCol) {
        name = nameFromCol;
      } else if (description) {
        const extracted = extractNameFromDescription(description);
        if (extracted) {
          name = extracted;
        }
      }

      let clientId: string | null = null;
      let clientFound = false;
      let status = "matched";
      let confidence = 0;
      let autoApply = false;
      let autoApplyTxId: string | null = null;

      const occurred = parseDate(canonical.date);
      const paymentMethod = (canonical.payment ? String(canonical.payment).trim() : null) || detectPaymentMethod(description);
      const phoneRaw1 = canonical.phone1 ? String(canonical.phone1).trim() : "";
      const phoneRaw2 = canonical.phone2 ? String(canonical.phone2).trim() : "";
      const phoneRaw = phoneRaw1 || phoneRaw2;

      if (specialCat === "INTERNA") {
        name = "Transferência Interna";
        status = "applied";
        confidence = 100;
        autoApply = true;
      } else if (specialCat === "TARIFA") {
        name = "Tarifa Bancária";
        status = "applied";
        confidence = 100;
        autoApply = true;
      } else if (specialCat === "JUROS") {
        name = "Juros Bancários";
        status = "applied";
        confidence = 100;
        autoApply = true;
      } else if (specialCat === "APLICACAO") {
        name = "Aplicação Financeira";
        status = "applied";
        confidence = 100;
        autoApply = true;
      } else if (specialCat === "RESGATE") {
        name = "Resgate de Investimento";
        status = "applied";
        confidence = 100;
        autoApply = true;
      }

      if (!specialCat && name) {
        const normName = jsNormalizeName(name);
        if (normName) {
          const { data: byNormName } = await admin
            .from("clients")
            .select("id, name")
            .eq("company_id", job.company_id)
            .eq("normalized_name", normName)
            .limit(1);
          if (byNormName && byNormName.length > 0) {
            clientId = byNormName[0].id;
            clientFound = true;
            name = byNormName[0].name;
          }
        }

        if (!clientFound) {
          const { data: dup } = await admin.rpc("find_duplicate_client", {
            _company_id: job.company_id,
            _name: name,
            _phone: phoneRaw || "",
            _threshold: 0.7,
          });
          const first = Array.isArray(dup) ? dup[0] : null;
          if (first) {
            clientId = first.id;
            clientFound = true;
          }
        }
      }

      let phoneApi: string | null = null;
      if (phoneRaw1 && !specialCat) {
        const { data: p } = await admin.rpc("normalize_phone", { _phone: phoneRaw1 });
        phoneApi = (p as string | null) ?? null;
      }
      let phoneApi2: string | null = null;
      if (phoneRaw2 && !specialCat) {
        const { data: p } = await admin.rpc("normalize_phone", { _phone: phoneRaw2 });
        phoneApi2 = (p as string | null) ?? null;
      }

      let offeringId: string | null = null;
      let offeringKind: string | null = null;
      let offeringLabel: string | null = null;
      let amountMatch = false;
      let descMatch = false;
      let tenantPattern = false;
      if (!specialCat && amount != null) {
        if (!isExpense) {
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
      }

      if (!specialCat) {
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
        status = confidence >= 95 ? "matched" : confidence >= 70 ? "review" : "manual";
      }

      let isDuplicate = false;
      if (!specialCat && amount != null && occurred) {
        if (isExpense) {
          let query = admin
            .from("financial_transactions")
            .select("id")
            .eq("company_id", job.company_id)
            .eq("type", "EXPENSE")
            .eq("amount", amount)
            .eq("transaction_date", occurred);
          if (description) {
            query = query.ilike("description", description);
          }
          const { data: dupTx } = await query.limit(1);
          if (dupTx && dupTx.length > 0) isDuplicate = true;
        } else {
          if (clientId) {
            const startOfDay = `${occurred}T00:00:00.000Z`;
            const endOfDay = `${occurred}T23:59:59.999Z`;
            const { data: dupApp } = await admin
              .from("appointments")
              .select("id")
              .eq("company_id", job.company_id)
              .eq("client_id", clientId)
              .eq("price", amount)
              .gte("start_datetime", startOfDay)
              .lte("start_datetime", endOfDay)
              .limit(1);
            if (dupApp && dupApp.length > 0) isDuplicate = true;
          }
          if (!isDuplicate) {
            let query = admin
              .from("financial_transactions")
              .select("id")
              .eq("company_id", job.company_id)
              .eq("type", "INCOME")
              .eq("amount", amount)
              .eq("transaction_date", occurred);
            if (description) {
              query = query.ilike("description", description);
            }
            const { data: dupTx } = await query.limit(1);
            if (dupTx && dupTx.length > 0) isDuplicate = true;
          }
        }
      }

      const finalStatus = specialCat ? status : (isDuplicate ? "review" : status);
      if (finalStatus === "matched") matched++;
      else if (finalStatus === "review") review++;

      if (autoApply && amount != null) {
        let isExpenseLocal = true;
        let category = "Despesa Empresa";
        if (specialCat === "JUROS" || specialCat === "RESGATE") {
          isExpenseLocal = false;
          category = specialCat === "JUROS" ? "Juros Bancários" : "Resgate";
        } else if (specialCat === "APLICACAO") {
          isExpenseLocal = true;
          category = "Aplicação";
        } else if (specialCat === "TARIFA") {
          isExpenseLocal = true;
          category = "Tarifa Bancária";
        } else if (specialCat === "INTERNA") {
          isExpenseLocal = amountRaw! < 0;
          category = "Movimentação Interna";
        }
        const bankName = inferBankName(imp?.filename, description);
        const { data: existingProviders } = await admin
          .from("providers")
          .select("id")
          .eq("company_id", job.company_id)
          .eq("name", bankName)
          .limit(1);
        let providerId: string | null = null;
        if (existingProviders && existingProviders.length > 0) providerId = existingProviders[0].id;
        else {
          const { data: newProvider } = await admin.from("providers").insert({ company_id: job.company_id, name: bankName }).select("id").single();
          if (newProvider) providerId = newProvider.id;
        }
        const { data: tx } = await admin
          .from("financial_transactions")
          .insert({
            company_id: job.company_id,
            type: isExpenseLocal ? "EXPENSE" : "INCOME",
            category,
            description: name,
            amount: amount,
            transaction_date: occurred ?? new Date().toISOString().slice(0, 10),
            payment_method: paymentMethod ?? null,
            provider_id: providerId,
          })
          .select("id")
          .single();
        if (tx) {
          autoApplyTxId = tx.id;
          autoAppliedCount++;
        }
      }

      total++;
      const { data: insertedRow, error: rowErr } = await admin
        .from("import_rows")
        .insert({
          import_id,
          company_id: job.company_id,
          row_index: i,
          raw: canonical.rawRecord as never,
          parsed: {
            name,
            phoneRaw: phoneRaw1,
            phoneRaw2,
            description,
            amount,
            occurred,
            paymentMethod,
            isExpense,
            isDuplicate,
            isInternalTransfer: specialCat === "INTERNA",
            isBankFee: specialCat === "TARIFA",
            isBankInterest: specialCat === "JUROS",
            isInvestmentApply: specialCat === "APLICACAO",
            isInvestmentRedeem: specialCat === "RESGATE",
            expenseScope: isExpense ? "empresa" : undefined,
            revenueKindSet: !isExpense ? true : undefined,
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
          status: finalStatus,
          action_taken: autoApplyTxId ? (isExpense ? "create_expense" : "create_income") : null,
          transaction_id: autoApplyTxId ?? null,
          notes: specialCat === "INTERNA" ? "Movimentação interna automática" : specialCat === "TARIFA" ? "Tarifa bancária automática" : specialCat === "JUROS" ? "Juros bancários automáticos" : specialCat === "APLICACAO" ? "Aplicação automática detectada" : specialCat === "RESGATE" ? "Resgate automático de investimento" : isDuplicate ? "Possível duplicidade: já existe um lançamento com o mesmo valor e data." : isExpense ? "Despesa automática detectada" : offeringLabel ? `Sugestão: ${offeringLabel}` : null,
        })
        .select("id")
        .single();

      if (rowErr) {
        failed++;
        await admin.from("import_errors").insert({ import_id, company_id: job.company_id, code: "row_insert", message: rowErr.message });
        continue;
      }

      if (autoApplyTxId && insertedRow) {
        await admin.from("import_matches").insert({
          import_id,
          company_id: job.company_id,
          row_id: insertedRow.id,
          entity_type: "financial_transaction",
          entity_id: autoApplyTxId,
          confidence: 100,
          reason: isExpense ? "created_expense" : "created_contribution",
          action: "created",
        });
      }

      if (amount && finalStatus === "matched" && !isExpense) revenue += Number(amount);
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
        transactions_created: autoAppliedCount,
        finished_at: new Date().toISOString(),
      })
      .eq("id", import_id);

    return { total, matched, review, failed, revenue };
  } catch (err: any) {
    const stage = err.stage || "UNKNOWN";
    const msg = `[ETAPA: ${stage}] ${err.message ?? String(err)}\nStack: ${err.stack || "Sem stack"}`;
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

  const parsedObj =
    row.parsed && typeof row.parsed === "object" ? (row.parsed as any) : {};
  const isExpense =
    "isExpense" in parsedObj
      ? Boolean(parsedObj.isExpense)
      : isExpenseDescription(row.description) || (row.amount != null && row.amount < 0);
  const isContribution = !isExpense && Boolean(parsedObj.isContribution);

  if (isExpense || isContribution) {
    const expenseScope = isExpense
      ? (parsedObj.expenseScope === "pessoal" ? "Pessoal" : parsedObj.expenseScope === "empresa" ? "Empresa" : null)
      : null;
    const category = isExpense
      ? expenseScope ? `Despesa ${expenseScope}` : "Despesa"
      : "Aporte";
    const { data: tx, error: txErr } = await admin
      .from("financial_transactions")
      .insert({
        company_id: companyId,
        type: isExpense ? "EXPENSE" : "INCOME",
        category,
        description:
          row.description ?? (isExpense ? "Despesa automática (import)" : "Aporte (import)"),
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
        action_taken: isExpense ? "create_expense" : "create_contribution",
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
      reason: isExpense ? "created_expense" : "created_contribution",
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

  if (!clientId) {
    const nameToUse = row.client_name || "Cliente Importado";
    const phoneToUse = row.client_phone ?? null;
    const phone2ToUse = row.client_phone2 ?? null;

    // Search by normalized name to prevent duplicate client registrations
    const normNameToUse = jsNormalizeName(nameToUse);
    if (normNameToUse) {
      const { data: byName } = await admin
        .from("clients")
        .select("id")
        .eq("company_id", companyId)
        .eq("normalized_name", normNameToUse)
        .limit(1);

      if (byName && byName.length > 0) {
        clientId = byName[0].id;
      }
    }

    // If not found by name, and phone exists, check phone
    if (!clientId && phoneToUse) {
      const { data: byPhone } = await admin
        .from("clients")
        .select("id")
        .eq("company_id", companyId)
        .or(`phone.eq.${phoneToUse},phone2.eq.${phoneToUse}`)
        .limit(1);
      if (byPhone && byPhone.length > 0) {
        clientId = byPhone[0].id;
      }
    }

    // If not found by name/phone, and phone2 exists, check phone2
    if (!clientId && phone2ToUse) {
      const { data: byPhone2 } = await admin
        .from("clients")
        .select("id")
        .eq("company_id", companyId)
        .or(`phone.eq.${phone2ToUse},phone2.eq.${phone2ToUse}`)
        .limit(1);
      if (byPhone2 && byPhone2.length > 0) {
        clientId = byPhone2[0].id;
      }
    }

    if (!clientId) {
      const { data: c, error: ce } = await admin
        .from("clients")
        .insert({
          company_id: companyId,
          name: nameToUse,
          phone: phoneToUse,
          phone2: phone2ToUse,
          status: "ACTIVE",
          notes: "Criado pela importação",
        })
        .select("id")
        .single();
      if (ce) throw new Error(`cliente: ${ce.message}`);
      clientId = c.id;
      createdClient = true;
    }
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
      } else {
        // Auto-create a default service if none exists
        const { data: newService, error: serviceErr } = await admin
          .from("services")
          .insert({
            company_id: companyId,
            name: "Atendimento Importado",
            duration_minutes: 60,
            price: row.amount ?? 100.0,
            return_days: 30,
            active: true,
          })
          .select("id")
          .single();
        if (serviceErr)
          throw new Error(`Não foi possível criar o serviço automático: ${serviceErr.message}`);
        serviceId = newService.id;
      }
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
        source: "ADMIN",
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

    // Fetch return days from service
    const { data: svc } = await admin
      .from("services")
      .select("return_days, price")
      .eq("id", serviceId)
      .single();
    const returnDays = svc?.return_days ?? 30;
    const nextReturnDate = new Date(start.getTime() + returnDays * 24 * 60 * 60 * 1000);
    const nextReturnStr = nextReturnDate.toISOString().slice(0, 10);

    // Fetch current client spent and count
    const { data: clientObj } = await admin
      .from("clients")
      .select("total_spent, appointments_count, last_visit")
      .eq("id", clientId)
      .single();

    const currentSpent = Number(clientObj?.total_spent ?? 0);
    const currentCount = Number(clientObj?.appointments_count ?? 0);
    const currentLastVisit = clientObj?.last_visit ? new Date(clientObj.last_visit) : null;
    const shouldUpdateLastVisit = !currentLastVisit || start > currentLastVisit;

    await admin
      .from("clients")
      .update({
        ...(shouldUpdateLastVisit
          ? {
              last_visit: start.toISOString(),
              next_return: nextReturnStr,
            }
          : {}),
        total_spent: currentSpent + (row.amount ?? 0),
        appointments_count: currentCount + 1,
        status: "ACTIVE",
      })
      .eq("id", clientId);

    // Create next return opportunity
    await admin.from("return_opportunities").insert({
      company_id: companyId,
      client_id: clientId,
      service_id: serviceId,
      expected_return_date: nextReturnStr,
      estimated_value: row.amount ?? svc?.price ?? 0,
      status: "ON_TIME",
    });
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
