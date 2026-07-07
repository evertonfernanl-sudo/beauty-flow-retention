import { enrichRow, detectDirection, extractClient, extractDate, detectOperationType } from "../index";
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

describe("SIE V3 Semantic Enrichment Test Suite", () => {
  test("Cenário 1: Extração de cliente a partir de descrição do Nubank", () => {
    const name1 = extractClient("Transferência recebida pelo Pix - João da Silva");
    expect(name1).toBe("João da Silva");

    const name2 = extractClient("Transferência enviada pelo Pix - Maria Souza");
    expect(name2).toBe("Maria Souza");
    
    const name3 = extractClient("Compra no débito - Supermercado Pão de Açúcar");
    expect(name3).toBe("Supermercado Pão de Açúcar");

    // Novos casos específicos
    expect(extractClient("Resgate RDB")).toBeNull();
    expect(extractClient("Aplicação RDB")).toBeNull();
    expect(extractClient("Crédito em conta")).toBeNull();
    expect(extractClient("Valor adicionado para Pix no Crédito")).toBeNull();
    expect(extractClient("Pagamento de boleto efetuado CETA CENTRO DE ESTUDOS TECNICOS ALVORA")).toBe("CETA CENTRO DE ESTUDOS TECNICOS ALVORA");
    expect(extractClient("Transferência enviada pelo Pix SHPP BRASIL INSTITUICAO DE PAG - 38.372.267 /0001-82")).toBe("SHPP BRASIL INSTITUICAO DE PAG");
  });

  test("Cenário 2: Interpretação de datas no formato textual brasileiro", () => {
    const d1 = extractDate("01 JAN");
    expect(d1).toBe(`${new Date().getFullYear()}-01-01`);

    const d2 = extractDate("15 MAR 2026");
    expect(d2).toBe("2026-03-15");

    const d3 = extractDate("31 DEZ");
    expect(d3).toBe(`${new Date().getFullYear()}-12-31`);
  });

  test("Cenário 3: Detecção de tipo de operação", () => {
    expect(detectOperationType("Pix recebido de cliente")).toBe("PIX");
    expect(detectOperationType("Compra no cartão de crédito")).toBe("CARD");
    expect(detectOperationType("Pagamento de boleto bancário")).toBe("BOLETO");
    expect(detectOperationType("TED enviada")).toBe("TRANSFER");
  });

  test("Cenário 4: Detecção determinística de direção (Prioridades)", () => {
    // Prioridade 1: Descrição de despesa
    const c1: Partial<CanonicalRow> = { description: "Compra no débito - Supermercado", amount: 100 };
    expect(detectDirection(c1 as any)).toBe("EXPENSE");

    // Prioridade 2: Descrição de receita
    const c2: Partial<CanonicalRow> = { description: "Pix recebido de cliente", amount: -100 };
    expect(detectDirection(c2 as any)).toBe("INCOME");

    // Prioridade 3: Coluna Débito
    const c3: Partial<CanonicalRow> = { debit_amount: 50 };
    expect(detectDirection(c3 as any)).toBe("EXPENSE");

    // Prioridade 4: Coluna Crédito
    const c4: Partial<CanonicalRow> = { credit_amount: 50 };
    expect(detectDirection(c4 as any)).toBe("INCOME");

    // Prioridade 5: Valor negativo
    const c5: Partial<CanonicalRow> = { amount: -50 };
    expect(detectDirection(c5 as any)).toBe("EXPENSE");

    // Prioridade 6: Valor positivo
    const c6: Partial<CanonicalRow> = { amount: 50 };
    expect(detectDirection(c6 as any)).toBe("INCOME");
  });

  test("Cenário 5: Enriquecimento de linha sem sobrescrita destrutiva", () => {
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

    const enriched = enrichRow(row);
    // Não deve sobrescrever o cliente nem a data nem o tipo
    expect(enriched.client_name).toBe("Cliente Existente");
    expect(enriched.transaction_date).toBe("2026-05-10");
    expect(enriched.movement_type).toBe("EXISTING_TYPE");
    // Mas a descrição é normalizada
    expect(enriched.description).toBe("Transferência recebida pelo Pix - Outro Nome");
  });
});
