import { reconstructLayoutWithoutHeader } from "../layoutReconstructor";
import { extractNativePdfToCsv } from "../nativeExtractor";
import { classifyPage } from "../pageClassifier";
import { PageColumnLayout } from "../pageLayout";

// Custom Minimalist Test Runner to avoid external test framework dependencies
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
    console.error(err.stack || err.message || err);
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
  toBeNull: () => {
    if (actual !== null) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be null`);
    }
  },
  toBeDefined: () => {
    if (actual === undefined) {
      throw new Error(`Expected value to be defined`);
    }
  },
  toThrow: async (expectedMsg?: string) => {
    let threw = false;
    try {
      await actual();
    } catch (err: any) {
      threw = true;
      if (expectedMsg && !err.message.includes(expectedMsg)) {
        throw new Error(`Expected error containing "${expectedMsg}" but got "${err.message}"`);
      }
    }
    if (!threw) {
      throw new Error(`Expected function to throw an error`);
    }
  }
});

// Helper to build a mock page
function createMockPage(pageNumber: number, rows: string[][], options?: { colWidths?: number[] }) {
  const items: any[] = [];
  rows.forEach((row, rowIdx) => {
    const y = 500 - rowIdx * 20;
    row.forEach((cellText, colIdx) => {
      const colX = options?.colWidths 
        ? options.colWidths.slice(0, colIdx).reduce((a, b) => a + b, 0) 
        : colIdx * 100;
      items.push({
        str: cellText,
        transform: [1, 0, 0, 1, colX, y],
        width: cellText.length * 6
      });
    });
  });
  return {
    pageNumber,
    getTextContent: async () => ({ items }),
    getViewport: () => ({ width: 600, height: 800 })
  };
}

function createMockPdfProxy(pages: Array<{ pageNumber: number; rows: string[][]; colWidths?: number[] }>) {
  return {
    numPages: pages.length,
    getPage: async (i: number) => {
      const pageDef = pages.find(p => p.pageNumber === i);
      if (!pageDef) throw new Error(`Page ${i} not found`);
      return createMockPage(pageDef.pageNumber, pageDef.rows, { colWidths: pageDef.colWidths });
    }
  };
}

describe("SIE V3 Native PDF Layout Reconstruction Test Suite", () => {

  test("Cenário 1: PDF nativo com cabeçalho normal", async () => {
    const pdf = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["Data", "Histórico", "Documento", "Valor", "Saldo"],
          ["14/07/2026", "PIX RECEBIDO DE JOAO", "123", "150,00", "1000,00"]
        ]
      }
    ]);
    const res = await extractNativePdfToCsv(pdf, { fileHash: "h1", nativePages: [1] });
    expect(res.csvText.includes("date;description;amount;debit;credit;balance")).toBe(true);
    expect(res.csvText.includes("14/07/2026")).toBe(false); // check that dates are canonicalized to YYYY-MM-DD
    expect(res.csvText.includes("2026-07-14")).toBe(true);
  });

  test("Cenário 2: PDF nativo sem cabeçalho e layout estável", async () => {
    const pdf = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["14/07/2026", "PIX RECEBIDO DE JOAO", "123", "150,00", "1000,00"],
          ["15/07/2026", "TARIFA MENSALIDADE", "99", "-12,00", "988,00"],
          ["16/07/2026", "TED ENVIADA", "100", "-500,00", "488,00"]
        ]
      }
    ]);
    const res = await extractNativePdfToCsv(pdf, { fileHash: "h2", nativePages: [1] });
    expect(res.csvText.includes("2026-07-14;PIX RECEBIDO DE JOAO")).toBe(true);
    expect(res.extractedLinesCount).toBe(3);
  });

  test("Cenário 3: PDF nativo com cabeçalho apenas na primeira página", async () => {
    const pdf = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["Data", "Histórico", "Documento", "Valor", "Saldo"],
          ["14/07/2026", "PIX JOAO", "1", "150,00", "1000,00"]
        ]
      },
      {
        pageNumber: 2,
        rows: [
          ["15/07/2026", "TED MARIA", "2", "-20,00", "980,00"]
        ]
      }
    ]);
    const res = await extractNativePdfToCsv(pdf, { fileHash: "h3", nativePages: [1, 2] });
    expect(res.csvText.includes("2026-07-14;PIX JOAO")).toBe(true);
    expect(res.csvText.includes("2026-07-15;TED MARIA")).toBe(true);
    expect(res.extractedLinesCount).toBe(2);
  });

  test("Cenário 4: PDF multipágina com layouts equivalentes", async () => {
    const pdf = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["14/07/2026", "TRANSF JOAO", "12", "100,00", "1000,00"],
          ["15/07/2026", "TRANSF PEDRO", "13", "-50,00", "950,00"],
          ["16/07/2026", "TRANSF RITA", "14", "-10,00", "940,00"]
        ]
      },
      {
        pageNumber: 2,
        rows: [
          ["17/07/2026", "TRANSF GUTO", "15", "200,00", "1140,00"],
          ["18/07/2026", "TRANSF LEO", "16", "-30,00", "1110,00"],
          ["19/07/2026", "TRANSF ANNA", "17", "-10,00", "1100,00"]
        ]
      }
    ]);
    const res = await extractNativePdfToCsv(pdf, { fileHash: "h4", nativePages: [1, 2] });
    expect(res.csvText.includes("2026-07-14;TRANSF JOAO")).toBe(true);
    expect(res.csvText.includes("2026-07-17;TRANSF GUTO")).toBe(true);
  });

  test("Cenário 5: PDF multipágina com layouts diferentes", async () => {
    const pdf = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["14/07/2026", "TRANSF JOAO", "12", "100,00", "1000,00"],
          ["15/07/2026", "TRANSF PEDRO", "13", "-50,00", "950,00"],
          ["16/07/2026", "TRANSF RITA", "14", "-10,00", "940,00"]
        ],
        colWidths: [80, 150, 50, 70, 70]
      },
      {
        pageNumber: 2,
        rows: [
          ["17/07/2026", "TRANSF GUTO", "15", "200,00", "1140,00"],
          ["18/07/2026", "TRANSF LEO", "16", "-30,00", "1110,00"],
          ["19/07/2026", "TRANSF ANNA", "17", "-10,00", "1100,00"]
        ],
        colWidths: [120, 100, 60, 80, 80] // different coordinate spacing
      }
    ]);
    const res = await extractNativePdfToCsv(pdf, { fileHash: "h5", nativePages: [1, 2] });
    expect(res.csvText.includes("2026-07-14;TRANSF JOAO")).toBe(true);
    expect(res.csvText.includes("2026-07-17;TRANSF GUTO")).toBe(true);
  });

  test("Cenário 6: Página institucional nativa sem transações", async () => {
    // Page contains metadata/texts but no stable date/money columns
    const pdf = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["Banco Inter S.A.", "Extrato de Conta"],
          ["Cliente: Maria da Silva", "Agencia: 0001"],
          ["Este documento é confidencial"]
        ]
      }
    ]);
    
    await expect(async () => {
      await extractNativePdfToCsv(pdf, { fileHash: "h6", nativePages: [1] });
    }).toThrow("Falha na reconstrução estrutural do PDF nativo");
  });

  test("Cenário 7: Extrato com apenas uma transação", async () => {
    // 7A. Known bank layout (like banco nubank)
    const pdfNubank = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["Nu Pagamentos S.A. Extrato Mensal"], // bank infer signal
          ["14/07/2026", "PIX RECEBIDO DE JOAO", "123", "150,00", "1000,00"]
        ]
      }
    ]);
    const resNubank = await extractNativePdfToCsv(pdfNubank, { fileHash: "h7a", nativePages: [1] });
    expect(resNubank.csvText.includes("2026-07-14;PIX RECEBIDO DE JOAO")).toBe(true);

    // 7B. Unknown bank layout (should fail layout resolution because it needs min 3 rows)
    const pdfUnknown = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["14/07/2026", "PIX RECEBIDO DE JOAO", "123", "150,00", "1000,00"]
        ]
      }
    ]);
    await expect(async () => {
      await extractNativePdfToCsv(pdfUnknown, { fileHash: "h7b", nativePages: [1] });
    }).toThrow("Falha na reconstrução estrutural do PDF nativo");
  });

  test("Cenário 8: Layout ambíguo que deve ser rejeitado", async () => {
    // Ambiguous columns: no distinct column structure (all texts overlap or lack coordinates)
    const pdf = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["texto", "texto"],
          ["14/07/2026", "14/07/2026"], // duplicate dates in columns
          ["150,00", "150,00"]
        ]
      }
    ]);
    await expect(async () => {
      await extractNativePdfToCsv(pdf, { fileHash: "h8", nativePages: [1] });
    }).toThrow("Falha na reconstrução estrutural do PDF nativo");
  });

  test("Cenário 9: Dez execuções consecutivas determinísticas", async () => {
    const pdf = createMockPdfProxy([
      {
        pageNumber: 1,
        rows: [
          ["14/07/2026", "PIX JOAO", "1", "150,00", "1000,00"],
          ["15/07/2026", "TED MARIA", "2", "-20,00", "980,00"],
          ["16/07/2026", "TAR MENS", "3", "-10,00", "970,00"]
        ]
      }
    ]);

    const outputs: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await extractNativePdfToCsv(pdf, { fileHash: "h9_runs", nativePages: [1] });
      outputs.push(res.csvText);
    }

    const allMatch = outputs.every(out => out === outputs[0]);
    expect(allMatch).toBe(true);
    expect(outputs[0].includes("2026-07-14;PIX JOAO")).toBe(true);
  });
});
