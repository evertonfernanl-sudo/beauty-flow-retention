export const BANK_NAMES = [
  "nubank", "itau", "itaú", "bradesco", "caixa", "santander", "banco do brasil",
  "inter", "c6", "sicredi", "sicoob", "pagbank", "mercado pago", "stone", "picpay",
  "original", "original", "neon"
];

export const MONTHS: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12"
};

export const CLIENT_BLACKLIST = [
  "pix", "ted", "doc", "tarifa", "compra", "saque", "pagamento", "recebido",
  "transferencia", "transferência", "itau", "itaú", "bradesco", "caixa", "nubank",
  "banco", "itaucard", "saldo", "extrato", "juros", "tributo", "mensalidade",
  "taxa", "retirada", "deposito", "depósito", "agencia", "agência", "conta",
  "nu pagamentos", "pagamentos", "santander", "pagseguro", "stone", "picpay",
  "mercado pago", "inter", "original", "cpf", "cnpj", "enviado", "enviada",
  "recebida", "a favor de", "beneficiario", "beneficiário", "destino", "recebedor",
  "pelo", "pela", "pelos", "pelas", "com", "para", "de", "da", "do", "das", "dos", "des"
];

export const CLIENT_PREFIXES = [
  /^transfer[êe]ncia\s+recebida\s+pelo\s+pix\s*/i,
  /^transfer[êe]ncia\s+enviada\s+pelo\s+pix\s*/i,
  /^transfer[êe]ncia\s+recebida\s+de\s*/i,
  /^transfer[êe]ncia\s+enviada\s+para\s*/i,
  /^transfer[êe]ncia\s+recebida\s*/i,
  /^transfer[êe]ncia\s+enviada\s*/i,
  /^pagamento\s+de\s+boleto\s+efetuado\s*/i,
  /^pagamento\s+de\s+boleto\s*/i,
  /^pagamento\s+efetuado\s*/i,
  /^pagamento\s+de\s*/i,
  /^pagamento\s+a\s*/i,
  /^pagamento\s+para\s*/i,
  /^pagamento\s+/i,
  /^pgto\s+de\s*/i,
  /^pgto\s+/i,
  /^pix\s+recebido\s+de\s*/i,
  /^pix\s+enviado\s+para\s*/i,
  /^pix\s+recebido\s*/i,
  /^pix\s+enviado\s*/i,
  /^compra\s+no\s+d[eé]bito\s*/i,
  /^compra\s+no\s+cr[eé]dito\s*/i,
  /^compra\s+cart[ãa]o\s*/i,
  /^compra\s*/i,
  /^saque\s+de\s*/i,
  /^saque\s*/i,
];

// Patterns for transactionPatternLibrary
export const SYSTEM_PATTERNS = [
  { key: "SYSTEM_INTERNAL_TRANSFER", regex: /\b(transferencia\s+entre\s+contas|transfer[êe]ncia\s+entre\s+contas|movimentacao\s+interna|movimenta[çc][ãa]o\s+interna|transferencia\s+interna|transfer[êe]ncia\s+interna|mesmo\s+titular|transf\s+entre\s+contas|transf\.\s+entre\s+contas|transferencia\s+conta\s+pessoal|transfer[êe]ncia\s+conta\s+pessoal)\b/i },
  { key: "SYSTEM_FEE", regex: /\b(tarifa|taxa|mensalidade|anuidade|bank\s+fee|debit\s+fee|iof|tributo|imposto|pacote\s+de\s+servi[çc]os|encargos\s+limite|iof\s+s\/\s+utiliza[çc][ãa]o)\b/i },
  { key: "SYSTEM_CREDIT_IN_ACCOUNT", regex: /\b(credito\s+em\s+conta|crédito\s+em\s+conta|valor\s+adicionado\s+para\s+pix|valor\s+adicionado)\b/i },
  { key: "SYSTEM_LOAN_REDEMPTION", regex: /\b(resgate\s+de\s+emprestimo|resgate\s+de\s+empréstimo)\b/i },
  { key: "SYSTEM_LOAN", regex: /\b(emprestimo|empréstimo)\b/i },
];

// Subtype classification keywords (business layer, not enrichment)
export const SUBTYPE_KEYWORDS = {
  STRONG_INCOME: /(PIX\s+RECEBIDO|TED\s+RECEBIDA|CREDITO\s+CLIENTE|PAGAMENTO\s+RECEBIDO|VENDA)/i,
  STRONG_EXPENSE: /(PIX\s+ENVIADO|TED\s+ENVIADA|FORNECEDOR|BOLETO\s+PAGO|ALUGUEL|ENERGIA|INTERNET|IMPOSTO)/i,
  APORTE: /(TRANSFER[EÊ]NCIA\s+CONTA\s+PESSOAL|APORTE|INTEGRALIZA|EMPR[EÉ]STIMO|RESGATE\s+APLICA)/i,
  PESSOAL: /(MERCADO|FARMACIA|FARMÁCIA|RESTAURANTE|CINEMA|IFOOD|UBER|LAZER|PESSOAL)/i,
};

export const INVESTMENT_PATTERNS = [
  { key: "SYSTEM_RDB_REDEMPTION", regex: /\b(resgate\s+rdb|resgate\s+cdb|resgate\s+investimento|resgate\s+automat)\b/i },
  { key: "SYSTEM_RDB_APPLICATION", regex: /\b(aplicacao\s+rdb|aplicação\s+rdb|aplicacao\s+cdb|aplicação\s+cdb|aplicacao\s+investimento|aplicação\s+investimento|guardar\s+dinheiro|guardar\s+na\s+caixinha)\b/i },
  { key: "SYSTEM_RENDIMENTO", regex: /\b(rendimento|remuneracao|remuneração|juros\s+sobre\s+capital)\b/i },
];

export const PIX_PATTERNS = [
  { key: "PIX_RECEIVED", regex: /\b(pix\s+recebido|transferencia\s+recebida\s+pelo\s+pix|transferência\s+recebida\s+pelo\s+pix|recebido\s+pelo\s+pix|transfer[êe]ncia\s+recebida|dep[óo]sito\s+recebido)\b/i },
  { key: "PIX_SENT", regex: /\b(pix\s+enviado|transferencia\s+enviada\s+pelo\s+pix|transferência\s+enviada\s+pelo\s+pix|enviado\s+pelo\s+pix|pix\s+pago|pix\s+paga|pagamento\s+pix|transfer[êe]ncia\s+enviada)\b/i },
];

export const TED_PATTERNS = [
  { key: "TED_RECEIVED", regex: /\b(ted\s+recebida|ted\s+recebido|credito\s+ted|crédito\s+ted)\b/i },
  { key: "TED_SENT", regex: /\b(ted\s+enviada|ted\s+enviado|pagamento\s+ted)\b/i },
];

export const DOC_PATTERNS = [
  { key: "DOC_RECEIVED", regex: /\b(doc\s+recebido|doc\s+recebida)\b/i },
  { key: "DOC_SENT", regex: /\b(doc\s+enviado|doc\s+enviada)\b/i },
];

export const BOLETO_PATTERNS = [
  { key: "BOLETO_PAYMENT", regex: /\b(pagamento\s+de\s+boleto|pagamento\s+boleto|boleto\s+pago|boleto\s+efetuado)\b/i },
];

export const CARD_PATTERNS = [
  { key: "CARD_SHOPPING", regex: /\b(compra\s+no\s+cartao|compra\s+no\s+cartão|compra\s+cartao|compra\s+cartão|compra\s+credito|compra\s+debito|compra\s+no\s+debito|compra\s+no\s+crédito)\b/i },
  { key: "CARD_PAYMENT", regex: /\b(pagamento\s+fatura|pagamento\s+cartao|pagamento\s+cartão)\b/i },
];

export const PAYMENT_PATTERNS = [
  { key: "PAYMENT", regex: /\b(pagamento|pagto)\b/i },
];

export const TRANSFER_PATTERNS = [
  { key: "TRANSFER_RECEIVED", regex: /\b(transferencia\s+recebida|transferência\s+recebida|transf\s+recebida|recebido\s+de|deposito\s+recebido|depósito\s+recebido)\b/i },
  { key: "TRANSFER_SENT", regex: /\b(transferencia\s+enviada|transferência\s+enviada|transf\s+enviada|enviado\s+para|deposito\s+efetuado|depósito\s+efetuado)\b/i },
];

export const WITHDRAWAL_PATTERNS = [
  { key: "WITHDRAWAL", regex: /\b(saque|retirada)\b/i },
];

export const DEPOSIT_PATTERNS = [
  { key: "DEPOSIT", regex: /\b(deposito|depósito)\b/i },
];
