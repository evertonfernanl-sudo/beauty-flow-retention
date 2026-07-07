import { CanonicalHeader, HeaderAlias } from "../types";
import { financialAliases } from "./financial";
import { customerAliases } from "./customer";

export const ALIASES: Record<CanonicalHeader, HeaderAlias> = {
  client_name: customerAliases.client_name,
  description: financialAliases.description,
  amount: financialAliases.amount,
  transaction_date: financialAliases.transaction_date,
  balance: financialAliases.balance,
  document_number: financialAliases.document_number,
  cpf_cnpj: customerAliases.cpf_cnpj,
  phone: customerAliases.phone,
  email: customerAliases.email,
  debit_amount: financialAliases.debit_amount,
  credit_amount: financialAliases.credit_amount,
  movement_type: financialAliases.movement_type,
  raw_extra: {
    aliases: [],
    priority: 0
  }
};
