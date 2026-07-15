export type IssuerBank =
  | "banco nubank"
  | "banco inter"
  | "banco bradesco"
  | "banco itaú"
  | "banco caixa"
  | "banco do brasil"
  | "banco santander"
  | "banco sicredi"
  | "banco sicoob";

export function normalizeIssuerBankName(name?: string | null): IssuerBank | null {
  if (!name) return null;
  let clean = name.toLowerCase().trim();
  
  // Normalizar acentos
  clean = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Remoção controlada do sufixo societário
  clean = clean
    .replace(/\bs\.?\s*a\.?\b/g, "")
    .replace(/\bs\s*\/\s*a\b/g, "")
    .trim();

  // Substituir pontuação por espaços
  clean = clean.replace(/[.,\/()\-]/g, " ");

  // Normalizar espaços
  clean = clean.replace(/\s+/g, " ").trim();

  // Remoção controlada do prefixo institucional
  if (clean.startsWith("banco cooperativo ")) {
    clean = clean.substring(18);
  } else if (clean.startsWith("banco ")) {
    clean = clean.substring(6);
  }

  // Comparação com aliases conhecidos
  if (clean === "nubank" || clean === "nu pagamentos" || clean === "nu pagamento") return "banco nubank";
  if (clean === "inter") return "banco inter";
  if (clean === "bradesco") return "banco bradesco";
  if (clean === "itau" || clean === "itau unibanco") return "banco itaú";
  if (clean === "caixa" || clean === "caixa economica" || clean === "caixa economica federal" || clean === "cef") return "banco caixa";
  if (clean === "do brasil" || clean === "brasil" || clean === "bb") return "banco do brasil";
  if (clean === "santander") return "banco santander";
  if (clean === "sicredi") return "banco sicredi";
  if (clean === "sicoob") return "banco sicoob";

  return null;
}

export function inferIssuerBank(
  filename?: string | null,
  sampleText?: string | null
): IssuerBank | null {
  // --- PRIORIDADE 1: Identidade Institucional na Área Delimitada ---
  // A área institucional será as primeiras 10 linhas textuais disponíveis de sampleText
  let institutionalArea = "";
  if (sampleText) {
    const lines = sampleText.split(/\r?\n/).slice(0, 10);
    // Filtragem de salvaguarda: desconsiderar linhas que contêm simultaneamente data e termos transacionais óbvios
    const nonTransactionalLines = lines.filter(line => {
      const cleanLine = line.toLowerCase();
      const hasDate = /\d{2}\/\d{2}\/\d{4}/.test(cleanLine);
      const hasTransactionTerm = /pix|ted|doc|compra|pagamento|transferencia/i.test(cleanLine);
      return !(hasDate && hasTransactionTerm);
    });
    institutionalArea = nonTransactionalLines.join(" ");
  }

  const cleanInst = institutionalArea
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,\/()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Buscar termos institucionais fortes
  if (cleanInst.includes("nu pagamentos") || cleanInst.includes("nu pagamento")) return "banco nubank";
  if (cleanInst.includes("banco inter")) return "banco inter";
  if (cleanInst.includes("banco bradesco")) return "banco bradesco";
  if (cleanInst.includes("itau unibanco")) return "banco itaú";
  if (cleanInst.includes("caixa economica federal")) return "banco caixa";
  if (cleanInst.includes("banco do brasil")) return "banco do brasil";
  if (cleanInst.includes("banco santander")) return "banco santander";
  
  // Sicredi e Sicoob isolados só com contexto institucional coerente (agência, conta, cooperativa, titular etc.)
  const hasInstitutionalContext = /extrato|agencia|conta|titular|cooperativa/i.test(cleanInst);
  if (cleanInst.includes("banco cooperativo sicredi") || (cleanInst.includes("sicredi") && hasInstitutionalContext)) return "banco sicredi";
  if (cleanInst.includes("banco cooperativo sicoob") || (cleanInst.includes("sicoob") && hasInstitutionalContext)) return "banco sicoob";

  // --- PRIORIDADE 2: Metadados Estruturais ---
  // A Prioridade 2 não possui fonte disponível no pipeline atual e será ignorada nesta implementação.

  // --- PRIORIDADE 3: Nome do Arquivo ---
  const bankFromFilename = inferBankFromFilename(filename);
  if (bankFromFilename) return bankFromFilename;

  // --- PRIORIDADE 4: Corpo das Transações (Último Recurso) ---
  // No corpo completo, não basta apenas encontrar a razão social.
  // Deve haver contexto institucional inequívoco, como combinação de termos (ex: título de extrato ou agência/conta + razão social).
  if (sampleText) {
    const cleanBody = sampleText
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const hasExtratoOrAccountContext = /extrato|agencia|conta|titular/i.test(cleanBody);
    if (hasExtratoOrAccountContext) {
      if (cleanBody.includes("nu pagamentos s.a.") || cleanBody.includes("nu pagamentos sa")) return "banco nubank";
      if (cleanBody.includes("banco inter s.a.") || cleanBody.includes("banco inter sa")) return "banco inter";
      if (cleanBody.includes("banco bradesco s.a.") || cleanBody.includes("banco bradesco sa")) return "banco bradesco";
      if (cleanBody.includes("itau unibanco s.a.") || cleanBody.includes("itau unibanco sa")) return "banco itaú";
      if (cleanBody.includes("caixa economica federal")) return "banco caixa";
      if (cleanBody.includes("banco do brasil s.a.") || cleanBody.includes("banco do brasil sa")) return "banco do brasil";
      if (cleanBody.includes("banco santander s.a.") || cleanBody.includes("banco santander sa")) return "banco santander";
      if (cleanBody.includes("banco cooperativo sicredi s.a.") || cleanBody.includes("banco cooperativo sicredi sa")) return "banco sicredi";
      if (cleanBody.includes("banco cooperativo sicoob s.a.") || cleanBody.includes("banco cooperativo sicoob sa")) return "banco sicoob";
    }

    // --- PRIORIDADE 5: Códigos COMPE de banco em expressões como "BCO:237" ---
    const bankFromCode = inferBankFromCompeCode(cleanBody);
    if (bankFromCode) return bankFromCode;
  }

  return null;
}

// Mapa de códigos COMPE para IssuerBank
const COMPE_CODE_TO_BANK: Record<string, IssuerBank> = {
  "237": "banco bradesco",
  "260": "banco nubank",
  "077": "banco inter",
  "341": "banco itaú",
  "104": "banco caixa",
  "001": "banco do brasil",
  "033": "banco santander",
  "748": "banco sicredi",
  "756": "banco sicoob",
};

function inferBankFromCompeCode(text: string): IssuerBank | null {
  // Procura padrões como "bco:237", "bco 237", "banco 237" seguidos do código de 3 dígitos
  const re = /\bbco\s*[:\s]\s*(\d{3})\b|\bbanco\s*[:\s]\s*(\d{3})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const code = m[1] || m[2];
    if (code && COMPE_CODE_TO_BANK[code]) return COMPE_CODE_TO_BANK[code];
  }
  return null;
}

/**
 * Traduz o identificador interno IssuerBank (ex: "banco bradesco") para a razão social legível (ex: "Banco Bradesco S.A.").
 */
export function getHumanBankName(bank: IssuerBank | string | null | undefined): string {
  if (!bank) return "";
  switch (bank) {
    case "banco nubank": return "Nu Pagamentos S.A.";
    case "banco inter": return "Banco Inter S.A.";
    case "banco bradesco": return "Banco Bradesco S.A.";
    case "banco itaú": return "Itaú Unibanco S.A.";
    case "banco caixa": return "Caixa Econômica Federal";
    case "banco do brasil": return "Banco do Brasil S.A.";
    case "banco santander": return "Banco Santander S.A.";
    case "banco sicredi": return "Banco Cooperativo Sicredi S.A.";
    case "banco sicoob": return "Banco Cooperativo Sicoob S.A.";
    default: return String(bank);
  }
}

export function inferBankNameV3(
  filename?: string | null,
  sampleText?: string | null
): IssuerBank | null {
  return inferIssuerBank(filename, sampleText);
}

function inferBankFromFilename(filename?: string | null): IssuerBank | null {
  if (!filename) return null;
  const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
  const normalized = baseName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  
  const tokens = normalized
    .split(/[\s_\-\.\(\)]+/)
    .filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (token === "nu") {
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      if (i === 0 || prev === "extrato" || prev === "conta" || next === "extrato" || next === "conta") {
        return "banco nubank";
      }
    }
    if (token === "bb") {
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      if (i === 0 || prev === "extrato" || prev === "conta" || prev === "brasil" || next === "extrato" || next === "conta" || next === "brasil") {
        return "banco do brasil";
      }
    }
    
    if (token === "nubank") return "banco nubank";
    if (token === "inter") return "banco inter";
    if (token === "bradesco") return "banco bradesco";
    if (token === "itau") return "banco itaú";
    if (token === "caixa") return "banco caixa";
    if (token === "santander") return "banco santander";
    if (token === "sicredi") return "banco sicredi";
    if (token === "sicoob") return "banco sicoob";
    
    if (token === "do" && tokens[i + 1] === "brasil") return "banco do brasil";
  }
  return null;
}
