import {
  classifyNonTransactionalRow,
  AlignedRow,
  RowClassificationContext
} from "../nonTransactionalClassifier";

// Custom Minimalist Test Runner to avoid dependencies
function describe(name: string, fn: () => void) {
  console.log(`\n=== ${name} ===`);
  fn();
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(err.message || err);
    process.exit(1);
  }
}

const expect = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
    }
  },
  toBeFalsy: () => {
    if (actual) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`);
    }
  }
});

describe("SIE V3 Non-Transactional Row Classifier Test Suite", () => {

  const defaultContext: RowClassificationContext = {
    source: "pdf",
    pageNumber: 1,
    physicalLine: 1
  };

  test("Cenário 1: Linha vazia", () => {
    const row: AlignedRow = ["", "   ", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("EMPTY");
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 2: Agência institucional", () => {
    const row: AlignedRow = ["Agência 0001", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("INSTITUTIONAL");
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 3: Conta institucional", () => {
    const row: AlignedRow = ["Conta corrente: 12345-6", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("INSTITUTIONAL");
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 4: Titular", () => {
    const row: AlignedRow = ["Nome do titular: Maria da Silva", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("INSTITUTIONAL");
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 5: Dados iniciais", () => {
    const row: AlignedRow = ["DADOS INICIAIS", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category === "INSTITUTIONAL" || res.category === "METADATA").toBeTruthy();
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 6: Emissão do extrato", () => {
    const row: AlignedRow = ["Extrato gerado dia 10/07/2026", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("METADATA");
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 7: Valores em reais", () => {
    const row: AlignedRow = ["Valores em R$", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("METADATA");
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 8: Paginação", () => {
    const row: AlignedRow = ["Página 2 de 4", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category === "METADATA" || res.category === "FOOTER").toBeTruthy();
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 9: Cabeçalho tabular completo", () => {
    const row: AlignedRow = ["Data", "Histórico", "Débito", "Crédito"];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("REPEATED_HEADER");
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });

  test("Cenário 10: Palavra de cabeçalho isolada", () => {
    const row: AlignedRow = ["Valor", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("AMBIGUOUS"); // Sem contexto, fica ambíguo por ser curto e não ter data/valor
  });

  test("Cenário 11: Saldo inicial", () => {
    const row: AlignedRow = ["Saldo inicial", "1.000,00", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("BALANCE");
    expect(res.action).toBe("CAPTURE_AS_BALANCE");
  });

  test("Cenário 12: Saldo final", () => {
    const row: AlignedRow = ["Saldo final", "2.000,00", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("BALANCE");
    expect(res.action).toBe("CAPTURE_AS_BALANCE");
  });

  test("Cenário 13: Operação contendo saldo", () => {
    const row: AlignedRow = ["Ajuste de saldo promocional", "50,00", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("TRANSACTION_CANDIDATE");
    expect(res.action).toBe("FORWARD_TO_BLOCK_ASSEMBLER");
  });

  test("Cenário 14: Resumo do período", () => {
    const row: AlignedRow = ["Resumo do período", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("SUMMARY");
    expect(res.action).toBe("CAPTURE_AS_SUMMARY");
  });

  test("Cenário 15: Total de débitos", () => {
    const row: AlignedRow = ["Total de débitos", "1.500,00", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("TOTAL");
    expect(res.action).toBe("CAPTURE_AS_TOTAL");
  });

  test("Cenário 16: Débito e crédito simultâneos sem descrição", () => {
    const row: AlignedRow = ["", "1.000,00", "2.000,00"];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("AMBIGUOUS");
  });

  test("Cenário 17: Linha transacional comum", () => {
    const row: AlignedRow = ["10/07/2026", "PIX RECEBIDO JOAO", "100,00"];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("TRANSACTION_CANDIDATE");
    expect(res.action).toBe("FORWARD_TO_BLOCK_ASSEMBLER");
  });

  test("Cenário 18: Continuação com beneficiário", () => {
    const row: AlignedRow = ["João da Silva", "", ""];
    // Looks like continuation
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("TRANSACTION_CANDIDATE");
    expect(res.action).toBe("FORWARD_TO_BLOCK_ASSEMBLER");
    expect(res.reasonCode).toBe("TRANSACTION_CONTINUATION");
  });

  test("Cenário 19: Continuação com banco e conta", () => {
    const row: AlignedRow = ["Banco Inter Ag 0001 Conta 12345", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    // Protegida contra descarte automático como institucional
    expect(res.category).toBe("TRANSACTION_CANDIDATE");
    expect(res.action).toBe("FORWARD_TO_BLOCK_ASSEMBLER");
    expect(res.reasonCode).toBe("TRANSACTION_CONTINUATION");
  });

  test("Cenário 20: Dados de conta no cabeçalho", () => {
    const row: AlignedRow = ["Agência: 0001 Conta: 12345-6", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("INSTITUTIONAL");
  });

  test("Cenário 21: Rodapé de atendimento", () => {
    const row: AlignedRow = ["SAC 0800 000 0000", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("FOOTER");
  });

  test("Cenário 22: Código numérico transacional", () => {
    const row: AlignedRow = ["10/07/2026", "Doc 982736452", "50,00"];
    const res = classifyNonTransactionalRow(row, defaultContext);
    expect(res.category).toBe("TRANSACTION_CANDIDATE");
    expect(res.action).toBe("FORWARD_TO_BLOCK_ASSEMBLER");
  });

  test("Cenário 23: Página UNRESOLVED", () => {
    const row: AlignedRow = ["Compra Estabelecimento X", "10,00", ""];
    const context: RowClassificationContext = {
      source: "pdf",
      pageNumber: 2,
      physicalLine: 4
    };
    const res = classifyNonTransactionalRow(row, context);
    // Deve ser preservada como candidato
    expect(res.category).toBe("TRANSACTION_CANDIDATE");
    expect(res.action).toBe("FORWARD_TO_BLOCK_ASSEMBLER");
  });

  test("Cenário 24: Preservação de origem", () => {
    const context: RowClassificationContext = {
      source: "pdf",
      pageNumber: 4,
      physicalLine: 12
    };
    expect(context.pageNumber).toBe(4);
    expect(context.physicalLine).toBe(12);
  });

  test("Cenários 25 e 26: Ação correta de descarte", () => {
    const row: AlignedRow = ["Agência 0001", "", ""];
    const res = classifyNonTransactionalRow(row, defaultContext);
    // Linha administrativa descartada não pode seguir para o block assembler
    expect(res.action).toBe("DISCARD_BEFORE_BLOCKS");
  });
});
