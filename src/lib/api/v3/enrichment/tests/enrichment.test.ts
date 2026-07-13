import {
  enrichRow,
  detectDirection,
  extractClient,
  extractDate,
  detectOperation,
  detectTransactionPattern,
  normalizeDescription,
  validateCanonicalConsistency,
} from "../index";
import { CanonicalRow } from "../../pipeline.server";

function describe(name: string, fn: () => void) {
  console.log(`\n=== ${name} ===`);
  fn();
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  HN-ERR: Failed test "${name}":`, err.message || err);
    process.exit(1);
  }
}

const expect = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    }
  },
  toBeNull: () => {
    if (actual !== null) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be null`);
    }
  }
});

describe("SIE V3 Semantic Enrichment Test Suite - Universal (10/10)", () => {
  test("Cenário 1: Extração de cliente baseada em padrão e blacklist", () => {
    const p1 = detectTransactionPattern(normalizeDescription("Transferência recebida pelo Pix - João da Silva"));
    expect(p1).toBe("PIX_RECEIVED");
    expect(extractClient("Transferência recebida pelo Pix - João da Silva", p1)).toBe("João da Silva");

    const p2 = detectTransactionPattern(normalizeDescription("Transferência enviada pelo Pix - Maria Souza"));
    expect(p2).toBe("PIX_SENT");
    expect(extractClient("Transferência enviada pelo Pix - Maria Souza", p2)).toBe("Maria Souza");

    const p3 = detectTransactionPattern(normalizeDescription("Compra no débito - Supermercado Pão de Açúcar"));
    expect(p3).toBe("CARD_SHOPPING");
    expect(extractClient("Compra no débito - Supermercado Pão de Açúcar", p3)).toBe("Supermercado Pão de Açúcar");

    // Operações sistêmicas
    const pSystem1 = detectTransactionPattern(normalizeDescription("Resgate RDB"));
    expect(pSystem1).toBe("SYSTEM_RDB_REDEMPTION");
    expect(extractClient("Resgate RDB", pSystem1)).toBeNull();

    const pSystem2 = detectTransactionPattern(normalizeDescription("Aplicação RDB"));
    expect(pSystem2).toBe("SYSTEM_RDB_APPLICATION");
    expect(extractClient("Aplicação RDB", pSystem2)).toBeNull();

    // Outros casos específicos com CPFs/CNPJs ou lixo na string
    const pBoleto = detectTransactionPattern(normalizeDescription("Pagamento de boleto efetuado CETA CENTRO DE ESTUDOS TECNICOS ALVORA"));
    expect(pBoleto).toBe("BOLETO_PAYMENT");
    expect(extractClient("Pagamento de boleto efetuado CETA CENTRO DE ESTUDOS TECNICOS ALVORA", pBoleto)).toBe("CETA CENTRO DE ESTUDOS TECNICOS ALVORA");

    const pPixSHPP = detectTransactionPattern(normalizeDescription("Transferência enviada pelo Pix SHPP BRASIL INSTITUICAO DE PAG - 38.372.267/0001-82"));
    expect(pPixSHPP).toBe("PIX_SENT");
    expect(extractClient("Transferência enviada pelo Pix SHPP BRASIL INSTITUICAO DE PAG - 38.372.267/0001-82", pPixSHPP)).toBe("SHPP BRASIL INSTITUICAO DE PAG");

    // Bradesco / Nubank / Outros marcadores explícitos (Fase 15.2 e 15.3)
    expect(extractClient("DES: EVERTON FERNANDES LIM 06/07 PIX ENVIADO", "PIX_SENT")).toBe("EVERTON FERNANDES LIM");
    expect(extractClient("DES: Domingos Alves Lima 07/07 PIX RECEBIDO", "PIX_RECEIVED")).toBe("Domingos Alves Lima");
    expect(extractClient("REM: Ana Célia Andrade da 07/07 PIX ENVIADO", "PIX_SENT")).toBe("Ana Célia Andrade da");
    expect(extractClient("DES: ADRIELY SILVA DA ROCH 07/07", null)).toBe("ADRIELY SILVA DA ROCH");
    expect(extractClient("FAVORECIDO: JOÃO DA SILVA BANCO INTER AG 0001", "PIX_SENT")).toBe("JOÃO DA SILVA");
    expect(extractClient("DESTINATARIO: MARIA SOUZA CPF ***.123.456-**", "PIX_SENT")).toBe("MARIA SOUZA");
    expect(extractClient("BENEFICIÁRIO: EMPRESA TESTE LTDA CNPJ 00.000.000/0001-00", null)).toBe("EMPRESA TESTE LTDA");
  });

  test("Cenário 2: Interpretação de datas no formato textual brasileiro", () => {
    const d1 = extractDate("01 JAN");
    expect(d1).toBe(`${new Date().getFullYear()}-01-01`);

    const d2 = extractDate("15 MAR 2026");
    expect(d2).toBe("2026-03-15");

    const d3 = extractDate("31 DEZ");
    expect(d3).toBe(`${new Date().getFullYear()}-12-31`);
  });

  test("Cenário 3: Detecção de tipo de operação por padrão", () => {
    const p1 = detectTransactionPattern(normalizeDescription("Pix recebido de cliente"));
    expect(detectOperation("Pix recebido de cliente", p1)).toBe("PIX");

    const p2 = detectTransactionPattern(normalizeDescription("Compra no cartão de crédito"));
    expect(detectOperation("Compra no cartão de crédito", p2)).toBe("CARD");

    const p3 = detectTransactionPattern(normalizeDescription("Pagamento de boleto bancário"));
    expect(detectOperation("Pagamento de boleto bancário", p3)).toBe("BOLETO");

    const p4 = detectTransactionPattern(normalizeDescription("TED enviada"));
    expect(detectOperation("TED enviada", p4)).toBe("TRANSFER");
  });

  test("Cenário 4: Detecção determinística de direção", () => {
    // 1. Coluna Débito
    const c1: CanonicalRow = { debit_amount: 50, description: "Compra", amount: 50 } as any;
    expect(detectDirection(c1, null)).toBe("EXPENSE");

    // 2. Coluna Crédito
    const c2: CanonicalRow = { credit_amount: 50, description: "Depósito", amount: 50 } as any;
    expect(detectDirection(c2, null)).toBe("INCOME");

    // 3. Padrão indica saída
    const c3: CanonicalRow = { description: "Pix enviado - João" } as any;
    expect(detectDirection(c3, "PIX_SENT")).toBe("EXPENSE");

    // 4. Padrão indica entrada
    const c4: CanonicalRow = { description: "Pix recebido - Maria" } as any;
    expect(detectDirection(c4, "PIX_RECEIVED")).toBe("INCOME");

    // 5. Sinal negativo
    const c5: CanonicalRow = { amount: -20, description: "Tarifa" } as any;
    expect(detectDirection(c5, null)).toBe("EXPENSE");

    // 6. Sinal positivo
    const c6: CanonicalRow = { amount: 20, description: "Investimento" } as any;
    expect(detectDirection(c6, null)).toBe("INCOME");

    // Cenários específicos Nubank e novas regras de direção (Fase 15.5)
    const cPixSentNubank: CanonicalRow = { amount: -50, description: "PIX enviado para João" } as any;
    const patPixSent = detectTransactionPattern(normalizeDescription(cPixSentNubank.description));
    expect(patPixSent).toBe("PIX_SENT");
    expect(detectDirection(cPixSentNubank, patPixSent)).toBe("EXPENSE");

    const cPixRecNubank: CanonicalRow = { amount: 150, description: "PIX recebido de Maria" } as any;
    const patPixRec = detectTransactionPattern(normalizeDescription(cPixRecNubank.description));
    expect(patPixRec).toBe("PIX_RECEIVED");
    expect(detectDirection(cPixRecNubank, patPixRec)).toBe("INCOME");

    const cPixPagoNubank: CanonicalRow = { amount: -20, description: "PIX pago - Supermercado" } as any;
    const patPixPago = detectTransactionPattern(normalizeDescription(cPixPagoNubank.description));
    expect(patPixPago).toBe("PIX_SENT");
    expect(detectDirection(cPixPagoNubank, patPixPago)).toBe("EXPENSE");

    // Conflito de evidências (Debit e Credit preenchidos simultaneamente)
    const cConflict: CanonicalRow = { debit_amount: 10, credit_amount: 10, amount: 10 } as any;
    expect(detectDirection(cConflict, null)).toBe("INCOME"); // Fallback final (sinal positivo) já que colunas estruturais têm conflito mútuo
  });

  test("Cenário 5: Consistency Validator & Banco Fallback", () => {
    // Transação sistêmica sem cliente preenchido deve receber fallback do banco emissor
    const rowSys: CanonicalRow = {
      description: "Resgate RDB",
      client_name: null,
      amount: 100,
      transaction_date: "2026-06-02"
    } as any;
    const validated = validateCanonicalConsistency(rowSys, "SYSTEM_RDB_REDEMPTION", "banco nubank");
    expect(validated.client_name).toBe("banco nubank");

    // Cliente contendo palavra proibida (ex: "PIX") deve ser anulado
    const rowInvalidClient: CanonicalRow = {
      description: "Transferência recebida",
      client_name: "PIX",
      amount: 100,
      transaction_date: "2026-06-02"
    } as any;
    const validatedInvalid = validateCanonicalConsistency(rowInvalidClient, "TRANSFER_RECEIVED");
    expect(validatedInvalid.client_name).toBeNull();
  });

  test("Cenário 6: Enriquecimento de linha sem sobrescrita destrutiva", () => {
    const row: CanonicalRow = {
      client_name: "Cliente Existente",
      description: "Transferência recebida pelo Pix - Outro Nome",
      amount: 150,
      transaction_date: "2026-05-10",
      balance: null,
      document_number: null,
      cpf_cnpj: null,
      phone: null,
      debit_amount: null,
      credit_amount: null,
      movement_type: "EXISTING_TYPE",
      raw_extra: {}
    };

    const enriched = enrichRow(row, "banco nubank");
    // Não deve sobrescrever o cliente nem a data nem o tipo
    expect(enriched.client_name).toBe("Cliente Existente");
    expect(enriched.transaction_date).toBe("2026-05-10");
    expect(enriched.movement_type).toBe("EXISTING_TYPE");
    // Mas a descrição é original
    expect(enriched.description).toBe("Transferência recebida pelo Pix - Outro Nome");
  });
});
