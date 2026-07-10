import { assembleBlocks, BlockLineMetadata } from "../blockAssembler";

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
  toBeGreaterThan: (expected: number) => {
    if (actual <= expected) {
      throw new Error(`Expected ${actual} to be greater than ${expected}`);
    }
  },
  toBeFalsy: () => {
    if (actual) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
    }
  }
});

const parseDate = (s: string) => {
  if (/\b\d{2}\/\d{2}(\/\d{2,4})?\b/.test(s)) return s;
  return null;
};

describe("SIE V3 Block Assembler Test Suite (Fase 4)", () => {

  test("Teste 1 — Transação em uma linha", () => {
    const bodyMatrix = [["10/07/2026", "PIX RECEBIDO", "100,00"]];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("PIX RECEBIDO");
    expect(res.merged[0][0]).toBe("10/07/2026");
    expect(res.merged[0][2]).toBe("100,00");
  });

  test("Teste 2 — Descrição em duas linhas", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO", "100,00"],
      ["", "JOÃO DA SILVA", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("PIX ENVIADO JOÃO DA SILVA");
    expect(res.linesAppended).toBe(1);
  });

  test("Teste 3 — Descrição em três linhas", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO", "100,00"],
      ["", "JOÃO DA SILVA", ""],
      ["", "BANCO INTER AG 0001 CONTA 12345", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("PIX ENVIADO JOÃO DA SILVA BANCO INTER AG 0001 CONTA 12345");
  });

  test("Teste 4 — Duas transações consecutivas", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO", "100,00"],
      ["10/07/2026", "PIX RECEBIDO", "200,00"]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(2);
    expect(res.merged[0][1]).toBe("PIX ENVIADO");
    expect(res.merged[1][1]).toBe("PIX RECEBIDO");
  });

  test("Teste 5 — Continuação seguida de nova transação", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO", "100,00"],
      ["", "JOÃO", ""],
      ["10/07/2026", "PIX RECEBIDO", "200,00"]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(2);
    expect(res.merged[0][1]).toBe("PIX ENVIADO JOÃO");
    expect(res.merged[1][1]).toBe("PIX RECEBIDO");
  });

  test("Teste 6 — Linha apenas com data", () => {
    const bodyMatrix = [["10/07/2026", "", ""]];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    // Sem descrição nem valor, vira bloco ambíguo mas no temporal inheritance
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][0]).toBe("10/07/2026");
  });

  test("Teste 7 — Linha apenas com valor sem bloco aberto", () => {
    const bodyMatrix = [["", "", "100,00"]];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][2]).toBe("100,00");
  });

  test("Teste 8 — Valor em continuação de bloco sem valor", () => {
    const bodyMatrix = [
      ["10/07/2026", "COMPRA CARTÃO", ""],
      ["", "", "150,00"]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("COMPRA CARTÃO");
    expect(res.merged[0][2]).toBe("150,00");
  });

  test("Teste 9 — Segundo valor conflitante", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00"],
      ["", "OUTRA TRANSACAO?", "200,00"]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    // Nova linha contendo valor indica novo bloco para evitar fusão
    expect(res.merged.length).toBe(2);
    expect(res.merged[0][2]).toBe("100,00");
    expect(res.merged[1][2]).toBe("200,00");
  });

  test("Teste 10 — Documento complementar", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00", ""],
      ["", "DOC COMPLEMENTAR", "", "98765"]
    ];
    // i = 3 é a coluna de documento
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][3]).toBe("98765");
  });

  test("Teste 11 — Documento conflitante", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00", "12345"],
      ["", "DOC CONFLITANTE", "", "98765"]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][3]).toBe("12345"); // Preservado primeiro documento
  });

  test("Teste 12 — Linha administrativa residual", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00"],
      ["", "Extrato gerado dia", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(2);
  });

  test("Teste 13 — Cabeçalho residual", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00"],
      ["Data | Histórico | Valor", "", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(2);
    expect(res.merged[1][0]).toBe("Data | Histórico | Valor");
  });

  test("Teste 14 — Mudança de página sem continuidade", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00"],
      ["", "NOVO LANÇAMENTO", ""]
    ];
    const lineMetadata: BlockLineMetadata[] = [
      { pageNumber: 1, physicalLine: 10 },
      { pageNumber: 2, physicalLine: 1 } // Mudou de página
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      lineMetadata
    });
    // Sem truncamento, deve fechar no limite de página
    expect(res.merged.length).toBe(2);
  });

  test("Teste 15 — Continuação legítima entre páginas", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO PARA", "100,00"],
      ["", "JOÃO DA SILVA", ""]
    ];
    const lineMetadata: BlockLineMetadata[] = [
      { pageNumber: 1, physicalLine: 20 },
      { pageNumber: 2, physicalLine: 1 }
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      lineMetadata
    });
    // Descrição anterior terminando com "PARA" indica continuidade legítima!
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("PIX ENVIADO PARA JOÃO DA SILVA");
  });

  test("Teste 16 — Cabeçalho entre páginas", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO PARA", "100,00"],
      ["Data | Histórico | Valor", "", ""],
      ["", "JOÃO DA SILVA", ""]
    ];
    const lineMetadata: BlockLineMetadata[] = [
      { pageNumber: 1, physicalLine: 20 },
      { pageNumber: 2, physicalLine: 1 },
      { pageNumber: 2, physicalLine: 2 }
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      lineMetadata
    });
    // O cabeçalho no meio impede a continuação direta
    expect(res.merged.length).toBe(3);
  });

  test("Teste 17 — Página UNRESOLVED", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00"],
      ["", "Texto em página unresolved", ""]
    ];
    const lineMetadata = [
      { pageNumber: 1, physicalLine: 1, pageLayoutResolved: true },
      { pageNumber: 2, physicalLine: 1, pageLayoutResolved: false }
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      lineMetadata
    });
    // Sem metadados de layout resolvido
    expect(res.merged.length).toBe(2);
  });

  test("Teste 18 — Descrição próxima à coluna de valor", () => {
    const bodyMatrix = [["10/07/2026", "PIX RECEBIDO", "100,00"]];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged[0][1]).toBe("PIX RECEBIDO");
  });

  test("Teste 19 — Número de conta", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO", "100,00"],
      ["", "CONTA 12345", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("PIX ENVIADO CONTA 12345");
  });

  test("Teste 20 — Código PIX ou identificador longo", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO", "100,00"],
      ["", "E1293847293847293", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("PIX ENVIADO E1293847293847293");
  });

  test("Teste 21 — Duas datas diferentes no mesmo bloco", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00"],
      ["11/07/2026", "OUTRO PIX", "200,00"]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(2);
  });

  test("Teste 22 — Duas operações reconhecidas na mesma descrição", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO", "100,00"],
      ["10/07/2026", "COMPRA CARTAO", "50,00"]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(2);
  });

  test("Teste 23 — Ordem de origem", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX", "100,00"],
      ["", "CONTINUACAO", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("PIX CONTINUACAO");
  });

  test("Teste 24 — Deduplicação literal", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO", "100,00"],
      ["", "PIX ENVIADO", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(1);
    expect(res.merged[0][1]).toBe("PIX ENVIADO"); // Deduplicado!
  });

  test("Teste 25 — Repetição legítima", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX ENVIADO FULANO", "100,00"],
      ["", "FULANO DA SILVA", ""]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged[0][1]).toBe("PIX ENVIADO FULANO FULANO DA SILVA");
  });

  test("Teste 26 — Fim do arquivo", () => {
    const bodyMatrix = [
      ["10/07/2026", "PIX 1", "100,00"],
      ["11/07/2026", "PIX 2", "200,00"]
    ];
    const res = assembleBlocks({
      bodyMatrix,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate
    });
    expect(res.merged.length).toBe(2);
  });
});
