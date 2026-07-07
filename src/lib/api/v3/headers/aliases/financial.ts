import { HeaderAlias } from "../types";

const SFX = "([\\s\\(\\.\\:\\/\\-].*)?$";

export const financialAliases: Record<string, HeaderAlias> = {
  amount: {
    aliases: [
      "valor", "montante", "amount", "vlr", "total", "val", "vlr movimento", "vlr mov", "valor mov", "quantia"
    ],
    regex: [
      new RegExp(`^(valor|montante|amount|vlr|total|val|pre[cç]o|price|quantia)${SFX}`, "i"),
      new RegExp(`^vlr\\s*mov(imento)?${SFX}`, "i")
    ],
    priority: 100,
    deprecated: ["quantia antiga"],
    bankOverrides: {
      nubank: ["valor"],
      itau: ["valor movimento"]
    }
  },
  transaction_date: {
    aliases: [
      "data", "date", "dt", "dia", "quando", "occurred", "venda", "atendimento", "lançamento", "lancamento"
    ],
    regex: [
      new RegExp(`^(data|date|dt|dia|quando|occurred|venda|atendimento|lan[cç]amentos?)${SFX}`, "i"),
      new RegExp(`^(dt|data)\\s*(mov|lanc|movimento|lan[cç]amento|documento|opera[cç][aã]o)${SFX}`, "i"),
      new RegExp(`^(movement|transaction)\\s*date${SFX}`, "i")
    ],
    priority: 100
  },
  description: {
    aliases: [
      "descricao", "descrição", "historico", "histórico", "complemento", "narrativa", "evento", "operação", "operacao", "memo", "memorando", "detalhes", "lançamento", "observação", "observacao", "detalhamento", "serviço", "produto"
    ],
    regex: [
      new RegExp(`^(descri[cç][aã]o|hist[oó]rico|complemento|narrativa|evento|opera[cç][aã]o|memo(rando)?|detalhes|observa[cç][aã]o|detalhamento|servi[cç]o|produto)${SFX}`, "i")
    ],
    priority: 80
  },
  balance: {
    aliases: [
      "saldo", "balance"
    ],
    regex: [
      new RegExp(`^(saldo|balance)${SFX}`, "i")
    ],
    priority: 60
  },
  debit_amount: {
    aliases: [
      "debito", "débito", "saida", "saída", "saídas", "saidas", "valdb", "valdeb", "pago", "pagamento", "withdrawal", "withdrawals"
    ],
    regex: [
      new RegExp(`^(d[eé]bito|sa[ií]das?|valdb|valdeb|pago|pagamento|withdrawal(s)?)${SFX}`, "i")
    ],
    priority: 70
  },
  credit_amount: {
    aliases: [
      "credito", "crédito", "entrada", "entradas", "receita", "valcr", "valcred", "recebido", "recebida", "deposit", "deposits"
    ],
    regex: [
      new RegExp(`^(cr[eé]dito|entradas?|receita|valcr|valcred|recebida?o?|deposit(s)?)${SFX}`, "i")
    ],
    priority: 70
  },
  movement_type: {
    aliases: [
      "tipo", "natureza", "d/c", "c/d", "cd", "metodo", "forma"
    ],
    regex: [
      new RegExp(`^(tipo|natureza|d\\/c|c\\/d|cd|metodo|forma)${SFX}`, "i")
    ],
    priority: 50
  },
  document_number: {
    aliases: [
      "documento", "doc", "docto", "n°", "nº", "nr", "controle", "identificador"
    ],
    regex: [
      new RegExp(`^(docto|documento|doc|n[°ºr]|nr|controle|identificador)${SFX}`, "i")
    ],
    priority: 30
  }
};
