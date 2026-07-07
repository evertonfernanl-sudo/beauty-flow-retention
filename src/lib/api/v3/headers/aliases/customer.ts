import { HeaderAlias } from "../types";

const SFX = "([\\s\\(\\.\\:\\/\\-].*)?$";

export const customerAliases: Record<string, HeaderAlias> = {
  client_name: {
    aliases: [
      "cliente", "pagador", "favorecido", "beneficiário", "beneficiario", "recebedor", "nome", "destino", "origem", "sacado", "contraparte", "destinatário", "destinatario", "fornecedor", "cedente", "receiver", "payee", "customer", "contato"
    ],
    regex: [
      new RegExp(`^(cliente(s)?|pagador|favorecido|benefici[aá]rio|recebedor|nome|destino|origem|sacado|contraparte|destinat[aá]rio|fornecedor|cedente|receiver|payee|customer|contato)${SFX}`, "i")
    ],
    priority: 40
  },
  cpf_cnpj: {
    aliases: [
      "cpf", "cnpj", "cpf/cnpj", "documento favorecido", "inscrição", "inscricao"
    ],
    regex: [
      new RegExp(`^(cpf|cnpj|cpf\\s*\\/?\\s*cnpj|documento\\s*favorecido|inscri[cç][aã]o)${SFX}`, "i")
    ],
    priority: 30
  },
  phone: {
    aliases: [
      "telefone", "celular", "phone", "tel", "whatsapp"
    ],
    regex: [
      new RegExp(`^(telefone|celular|phone|tel|whatsapp)${SFX}`, "i")
    ],
    priority: 10
  },
  email: {
    aliases: [
      "email", "e-mail", "mail"
    ],
    regex: [
      new RegExp(`^(email|e-mail|mail)${SFX}`, "i")
    ],
    priority: 10
  }
};
