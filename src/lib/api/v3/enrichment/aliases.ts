export const BANK_KEYWORDS = [
  "PIX", "TED", "DOC", "TRANSFERENCIA", "TRANSFERÊNCIA", "PAGAMENTO",
  "RECEBIDO", "ENVIADO", "CPF", "CNPJ", "AGENCIA", "AGÊNCIA", "CONTA",
  "BANCO", "BOLETO", "COMPRA", "DEBITO", "CRÉDITO", "DÉBITO", "CREDITO",
  "SAQUE", "FORNECEDOR", "RECEBIMENTO", "ESTORNO", "TARIFA", "RENDIMENTO",
  "RESGATE", "INVESTIMENTO", "JUROS"
];

export const EXPENSE_KEYWORDS = [
  "pix enviado", "envio", "transferencia enviada", "transferência enviada",
  "ted enviada", "doc enviado", "pagamento", "compra", "saque", "tarifa",
  "débito", "debito", "despesa", "custo", "imposto", "tributo", "aluguel",
  "energia", "internet", "compra no cartão", "compra no cartao"
];

export const INCOME_KEYWORDS = [
  "pix recebido", "recebimento", "recebido", "transferencia recebida",
  "transferência recebida", "ted recebida", "doc recebido", "deposito",
  "depósito", "crédito", "credito", "rendimento", "juros", "resgate"
];

export const MONTH_MAP: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12"
};

export const BLACKLIST_CLIENT_WORDS = [
  "pix", "ted", "doc", "tarifa", "compra", "saque", "pagamento", "recebido",
  "transferencia", "transferência", "itau", "itaú", "bradesco", "caixa", "nubank",
  "banco", "itaucard", "saldo", "extrato", "juros", "tributo", "mensalidade",
  "taxa", "retirada", "deposito", "depósito", "agencia", "agência", "conta",
  "nu pagamentos", "pagamentos", "santander", "pagseguro", "stone", "picpay",
  "mercado pago", "inter", "original", "cpf", "cnpj", "enviado", "enviada",
  "recebida", "a favor de", "beneficiario", "beneficiário", "destino", "recebedor",
  "pelo", "pela", "pelos", "pelas", "com", "para", "de", "da", "do", "das", "dos", "des"
];

export const REGEX_PATTERNS = [
  /(?:transfer[êe]ncia\s+recebida\s+pelo\s+pix|transfer[êe]ncia\s+recebida\s+de|transfer[êe]ncia\s+recebida)\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
  /(?:transfer[êe]ncia\s+enviada\s+pelo\s+pix|transfer[êe]ncia\s+enviada\s+para|transfer[êe]ncia\s+enviada)\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
  /(?:pagamento\s+de\s+boleto\s+efetuado|pagamento\s+de\s+boleto|pagamento\s+efetuado)\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
  /p[ixle\s]+(?:qr\s+code\s+)?(?:estatic[o]?|dinamic[o]?)?.*?(?:des|rem)\s*:?\s*-?\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
  /(?:p[ixle\s]+recebido\s+de|p[ixle\s]+de|transferência\s+recebida\s+de|recebido\s+de|p[ixle\s]+recebido|ted\s+recebida|credito\s+p[ixle\s]+|transf\s+recebida|transferencia|ted|doc)\s*:?\s*-?\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
  /(?:p[ixle\s]+enviado\s+des\s*:|p[ixle\s]+enviado\s+para|p[ixle\s]+para|p[ixle\s]+enviado)\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
  /(?:recebimento\s+fornecedor\s+administradora\s+de\s+consorcio\s+naci|recebimento\s+fornecedor)\s*([A-Za-zÀ-ÿ\s'\.\-]{4,60})/i,
  /\b(bco:\d+\s+age:\d+\s+cta:[\d\-]+)\b/i,
  /(?:transf\s+saldo\s+c\/sal\s+p\/cc|transf|transferencia)\s*:?\s*-?\s*([A-Za-zÀ-ÿ0-9\s'\.\:\-/]{8,60})/i,
  // V3 specific prefix patterns (adapted to return client name directly)
  /(?:PARA|A FAVOR DE|BENEFICIARIO|BENEFICIÁRIO|DESTINO|RECEBEDOR|DES)[:\s]+([A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ\s\.\&\/\-]+?)(?:\s+CPF|\s+CNPJ|\s+AG|\s+CONTA|\s+BANCO|\s+\d{2}\/\d{2}|$)/i,
  /(?:DE|RECEBIDA DE|RECEBIDO DE|REM)[:\s]+([A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ\s\.\&\/\-]+?)(?:\s+CPF|\s+CNPJ|\s+AG|\s+CONTA|\s+BANCO|\s+\d{2}\/\d{2}|$)/i,
  /(?:COBRANCA|COBRANÇA)\s+([A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÄÉÊÍÓÔÕÚÜÇ\s\.\&\/\-]+?)(?:\s+CPF|\s+CNPJ|\s+AG|\s+CONTA|\s+BANCO|$)/i
];
