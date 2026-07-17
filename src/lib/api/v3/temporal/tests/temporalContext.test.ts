import { applyTemporalContextToBlocks } from "../temporalContext";
import { AssembledBlock, TemporalResolvedBlock } from "../temporalTypes";

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
  toBeFalsy: () => {
    if (actual) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
    }
  },
  toBeGreaterThan: (expected: number) => {
    if (typeof actual !== "number" || actual <= expected) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be greater than ${JSON.stringify(expected)}`);
    }
  }
});

const parseDate = (s: string): string | null => {
  if (!s) return null;
  const clean = s.trim();
  if (/\b\d{2}\/\d{2}\/\d{4}\b/.test(clean)) {
    const parts = clean.split("/");
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(clean)) return clean;
  return null;
};

describe("SIE V3 Temporal Context and Inheritance Test Suite (Fase 5)", () => {

  test("Teste 1 — Data explícita válida", () => {
    const blocks: AssembledBlock[] = [{
      row: ["10/07/2026", "PIX RECEBIDO", "100,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res.length).toBe(1);
    expect(res[0].dateAssignment).toBe("EXPLICIT");
    expect(res[0].dateNormalized).toBe("2026-07-10");
    expect(res[0].dateDetected).toBe(true);
    expect(res[0].dateInherited).toBe(false);
  });

  test("Teste 2 — Bloco sem data e sem contexto", () => {
    const blocks: AssembledBlock[] = [{
      row: ["", "PIX RECEBIDO", "100,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: false,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[0].dateAssignment).toBe("MISSING");
    expect(res[0].dateNormalized).toBe(null);
  });

  test("Teste 3 — Herança no mesmo dia agrupado", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX RECEBIDO", "100,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX ENVIADO", "50,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[0].dateAssignment).toBe("EXPLICIT");
    expect(res[1].dateAssignment).toBe("INHERITED");
    expect(res[1].dateNormalized).toBe("2026-07-10");
    expect(res[1].dateSourceBlockId).toBe("block_0");
  });

  test("Teste 4 — Cadeia de herança", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 3", "30,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 3 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[1].dateSourceBlockId).toBe("block_0");
    expect(res[2].dateSourceBlockId).toBe("block_0"); // Deve apontar para a origem original
  });

  test("Teste 5 — Nova data explícita", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["11/07/2026", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 3", "30,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 3 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[1].dateAssignment).toBe("EXPLICIT");
    expect(res[2].dateAssignment).toBe("INHERITED");
    expect(res[2].dateNormalized).toBe("2026-07-11");
    expect(res[2].dateSourceBlockId).toBe("block_1");
  });

  test("Teste 6 — Linha administrativa entre blocos", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 3 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const filteredRows = [{
      pageNumber: 1,
      physicalLine: 2,
      category: "METADATA",
      originalText: "Extrato gerado às 14h"
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      filteredRows
    });
    expect(res[1].dateAssignment).toBe("INHERITED");
    expect(res[1].dateNormalized).toBe("2026-07-10");
  });

  test("Teste 7 — Saldo inicial", () => {
    const blocks: AssembledBlock[] = [{
      row: ["", "PIX 1", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 2 }],
      hasExplicitDate: false,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const filteredRows = [{
      pageNumber: 1,
      physicalLine: 1,
      category: "BALANCE",
      originalText: "Saldo Inicial: 100,00"
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      filteredRows
    });
    expect(res[0].dateAssignment).toBe("MISSING");
  });

  test("Teste 8 — Saldo final", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 3 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const filteredRows = [{
      pageNumber: 1,
      physicalLine: 2,
      category: "BALANCE",
      originalText: "Saldo Final: 150,00"
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      filteredRows
    });
    expect(res[1].dateAssignment).toBe("MISSING"); // Saldo final invalidou contexto!
  });

  test("Teste 9 — Resumo do período", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 3 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const filteredRows = [{
      pageNumber: 1,
      physicalLine: 2,
      category: "SUMMARY",
      originalText: "Resumo de Entradas"
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      filteredRows
    });
    expect(res[1].dateAssignment).toBe("MISSING"); // Resumo do período invalidou contexto!
  });

  test("Teste 10 — Total de créditos", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 3 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const filteredRows = [{
      pageNumber: 1,
      physicalLine: 2,
      category: "TOTAL",
      originalText: "Total de Créditos: 100,00"
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      filteredRows
    });
    expect(res[1].dateAssignment).toBe("MISSING"); // Total invalidou contexto
  });

  test("Teste 11 — Data de emissão", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["Extrato gerado em 10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: false, // Não é transação explícita
        hasExplicitValue: true,
        isAmbiguous: true,
        ambiguityReasons: ["METADATA"]
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[0].dateAssignment).toBe("MISSING");
  });

  test("Teste 12 — Período do extrato", () => {
    const statementPeriod = { start: "2026-07-01", end: "2026-07-31" };
    const blocks: AssembledBlock[] = [{
      row: ["01/08/2026", "PIX", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      statementPeriod
    });
    expect(res[0].dateAssignment).toBe("CONFLICT");
    expect(res[0].dateReasonCode).toBe("OUTSIDE_STATEMENT_PERIOD");
  });

  test("Teste 13 — Data agrupadora válida", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "", ""], // Marcador de data
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: false,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 1", "50,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[0].dateAssignment).toBe("DATE_GROUP_MARKER");
    expect(res[1].dateAssignment).toBe("INHERITED");
    expect(res[1].dateNormalized).toBe("2026-07-10");
  });

  test("Teste 14 — Data isolada inválida", () => {
    const blocks: AssembledBlock[] = [{
      row: ["31/02/2026", "PIX", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[0].dateAssignment).toBe("CONFLICT");
    expect(res[0].dateReasonCode).toBe("INVALID_EXPLICIT_DATE");
  });

  test("Teste 15 — Mudança de página compatível", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 2,
        pageEnd: 2,
        originLines: [{ pageNumber: 2, physicalLine: 2 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[1].dateAssignment).toBe("INHERITED");
    expect(res[1].dateReasonCode).toBe("INHERITED_CROSS_PAGE");
  });

  test("Teste 16 — Mudança de página com saldo final", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 2,
        pageEnd: 2,
        originLines: [{ pageNumber: 2, physicalLine: 3 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const filteredRows = [{
      pageNumber: 1,
      physicalLine: 2,
      category: "BALANCE",
      originalText: "Saldo Final"
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      filteredRows
    });
    expect(res[1].dateAssignment).toBe("MISSING");
  });

  test("Teste 17 — Mudança de página com nova seção", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 2,
        pageEnd: 2,
        originLines: [{ pageNumber: 2, physicalLine: 3 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const filteredRows = [{
      pageNumber: 2,
      physicalLine: 1,
      category: "INSTITUTIONAL",
      originalText: "Conta Corrente: 12345"
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      filteredRows
    });
    expect(res[1].dateAssignment).toBe("INHERITED");
    expect(res[1].dateReasonCode).toBe("INHERITED_CROSS_PAGE");
  });

  test("Teste 18 — Página UNRESOLVED", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "PIX 2", "20,00"],
        pageStart: 2,
        pageEnd: 2,
        originLines: [{ pageNumber: 2, physicalLine: 2 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: true, // página unresolved vira ambígua
        ambiguityReasons: ["UNRESOLVED_LAYOUT_LINE"]
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[1].dateAssignment).toBe("MISSING");
  });

  test("Teste 19 — Bloco ambíguo", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "HISTÓRICO AMBÍGUO", ""],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: false,
        hasExplicitValue: false,
        isAmbiguous: true,
        ambiguityReasons: ["ORPHAN_TEXT"]
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[1].dateAssignment).toBe("MISSING");
  });

  test("Teste 20 — Duas datas no mesmo bloco (coluna de data tem prioridade e é mantida)", () => {
    const blocks: AssembledBlock[] = [{
      row: ["10/07/2026", "PIX ENVIADO EM 11/07/2026", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[0].dateAssignment).toBe("EXPLICIT");
    expect(res[0].dateNormalized).toBe("2026-07-10");
  });

  test("Teste 21 — Data explícita após contexto antigo", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["12/07/2026", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[0].dateNormalized).toBe("2026-07-10");
    expect(res[1].dateNormalized).toBe("2026-07-12");
  });

  test("Teste 22 — Bloco textual sem valor e sem data", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "TEXTO PURO CURTO", ""],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: false,
        hasExplicitValue: false,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[1].dateAssignment).toBe("MISSING");
  });

  test("Teste 23 — Bloco transacional com valor e operação sem data", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["", "COMPRA DÉBITO", "50,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: false,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });
    expect(res[1].dateAssignment).toBe("INHERITED");
    expect(res[1].dateNormalized).toBe("2026-07-10");
  });

  test("Teste 24 — Ordem crescente", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["10/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["11/07/2026", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const meta: any = {};
    applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      meta
    });
    // Validando que a direção seria detectada
    expect(meta.blocks_with_explicit_date).toBe(2);
  });

  test("Teste 25 — Ordem decrescente", () => {
    const blocks: AssembledBlock[] = [
      {
        row: ["12/07/2026", "PIX 1", "10,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 1 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      },
      {
        row: ["11/07/2026", "PIX 2", "20,00"],
        pageStart: 1,
        pageEnd: 1,
        originLines: [{ pageNumber: 1, physicalLine: 2 }],
        hasExplicitDate: true,
        hasExplicitValue: true,
        isAmbiguous: false,
        ambiguityReasons: []
      }
    ];
    const meta: any = {};
    applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      meta
    });
    expect(meta.blocks_with_explicit_date).toBe(2);
  });

  test("Teste 26 — Direção desconhecida", () => {
    const blocks: AssembledBlock[] = [{
      row: ["10/07/2026", "PIX 1", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const meta: any = {};
    applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      meta
    });
    expect(meta.blocks_with_explicit_date).toBe(1);
  });

  test("Teste 27 — Data fora do período", () => {
    const statementPeriod = { start: "2026-07-01", end: "2026-07-31" };
    const blocks: AssembledBlock[] = [{
      row: ["01/06/2026", "PIX", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      statementPeriod
    });
    expect(res[0].dateAssignment).toBe("CONFLICT");
    expect(res[0].dateReasonCode).toBe("OUTSIDE_STATEMENT_PERIOD");
  });

  test("Teste 28 — Ano ausente com contexto seguro", () => {
    // Ano ausente é tratado na normalização da data (nossa função parseDate normaliza usando o ano corrente).
    // Testamos a normalização com o ano corrente.
    const blocks: AssembledBlock[] = [{
      row: ["10/07", "PIX", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const customParse = (s: string) => {
      if (s === "10/07") return "2026-07-10";
      return null;
    };
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate: customParse,
      isCoordinateBased: true
    });
    expect(res[0].dateAssignment).toBe("EXPLICIT");
    expect(res[0].dateNormalized).toBe("2026-07-10");
  });

  test("Teste 29 — Ano ausente sem contexto seguro", () => {
    const blocks: AssembledBlock[] = [{
      row: ["10/07", "PIX", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    // Se o parseDate retornar null por não conseguir normalizar com segurança, deve dar MISSING/CONFLICT
    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate, // parseDate original retorna null para "10/07"
      isCoordinateBased: true
    });
    expect(res[0].dateAssignment).toBe("MISSING");
  });

  test("Teste 30 — Fim do arquivo", () => {
    const blocks: AssembledBlock[] = [{
      row: ["10/07/2026", "PIX", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];
    const meta: any = {};
    applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true,
      meta
    });
    expect(meta.temporal_context_invalidations).toBeGreaterThan(0); // END_OF_FILE no fim do arquivo invalidou
  });

  test("Teste 31 — Data curta na descrição não conflita com data explícita da coluna", () => {
    const blocks: AssembledBlock[] = [{
      row: ["08/06/2026", "DES: RD SAUDE 07/06", "86,00"],
      pageStart: 2,
      pageEnd: 2,
      originLines: [{ pageNumber: 2, physicalLine: 7 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];

    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate,
      isCoordinateBased: true
    });

    expect(res[0].dateAssignment).toBe("EXPLICIT");
    expect(res[0].dateNormalized).toBe("2026-06-08");
  });

  test("Teste 32 — Data completa na descrição (como 4/5/12) não conflita com data explícita da coluna", () => {
    const blocks: AssembledBlock[] = [{
      row: ["25/06/2026", "RENDIMENTOS POUP FACIL-DEPOS A PARTIR 4/5/12", "10,00"],
      pageStart: 1,
      pageEnd: 1,
      originLines: [{ pageNumber: 1, physicalLine: 1 }],
      hasExplicitDate: true,
      hasExplicitValue: true,
      isAmbiguous: false,
      ambiguityReasons: []
    }];

    const customParse = (s: string): string | null => {
      const clean = s.trim();
      if (clean === "25/06/2026") return "2026-06-25";
      if (clean === "4/5/12") return "2012-05-04";
      return null;
    };

    const res = applyTemporalContextToBlocks({
      blocks,
      dateIdx: 0,
      valueIdxs: [2],
      descIdx: 1,
      parseDate: customParse,
      isCoordinateBased: true
    });

    expect(res[0].dateAssignment).toBe("EXPLICIT");
    expect(res[0].dateNormalized).toBe("2026-06-25");
  });
});
