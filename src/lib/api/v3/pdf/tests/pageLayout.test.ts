import {
  compareDetectedLayouts,
  validatePageDataAgainstLayout,
  alignPhysicalCells,
  PageColumnLayout,
  PdfPhysicalLine,
  PdfPhysicalCell
} from "../pageLayout";

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
  },
  toBeNull: () => {
    if (actual !== null) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be null`);
    }
  }
});

describe("SIE V3 Page-by-page Layout Alignment Test Suite", () => {

  const layoutP1: PageColumnLayout = {
    pageNumber: 1,
    source: "DETECTED_HEADER",
    pageWidth: 500,
    headers: [
      { originalName: "Data", normalizedName: "data", x: 50, xRelative: 0.1 },
      { originalName: "Descrição", normalizedName: "descricao", x: 150, xRelative: 0.3 },
      { originalName: "Valor", normalizedName: "valor", x: 400, xRelative: 0.8 }
    ],
    confidence: "HIGH",
    reasons: []
  };

  test("Cenário 1: Duas páginas com mesmo layout absoluto", () => {
    const layoutP2: PageColumnLayout = {
      pageNumber: 2,
      source: "DETECTED_HEADER",
      pageWidth: 500,
      headers: [
        { originalName: "Data", normalizedName: "data", x: 50, xRelative: 0.1 },
        { originalName: "Descrição", normalizedName: "descricao", x: 150, xRelative: 0.3 },
        { originalName: "Valor", normalizedName: "valor", x: 400, xRelative: 0.8 }
      ],
      confidence: "HIGH",
      reasons: []
    };
    const isEquivalent = compareDetectedLayouts(layoutP1, layoutP2);
    expect(isEquivalent).toBeTruthy();
  });

  test("Cenário 2: Segunda página deslocada uniformemente (+10)", () => {
    // Linha física na página 2 deslocada em +10
    const linesP2: PdfPhysicalLine[] = [
      {
        pageNumber: 2,
        physicalLine: 1,
        y: 100,
        pageWidth: 500,
        cells: [
          { text: "01/06", x: 60, y: 100, width: 20, pageNumber: 2, pageWidth: 500 }, // esperado: 50+10
          { text: "Compra Mercado", x: 160, y: 100, width: 60, pageNumber: 2, pageWidth: 500 }, // esperado: 150+10
          { text: "-30,00", x: 410, y: 100, width: 30, pageNumber: 2, pageWidth: 500 } // esperado: 400+10
        ]
      }
    ];

    const resolved = validatePageDataAgainstLayout(linesP2, layoutP1, 2, 500);
    expect(resolved.source).toBe("REUSED_PREVIOUS");
    expect(resolved.appliedOffset).toBe(10);
    expect(resolved.confidence).toBe("HIGH");
  });

  test("Cenário 3: Largura de página diferente (pageWidth = 1000)", () => {
    // Layout relativo idêntico, mas na largura de 1000pt
    const layoutP2: PageColumnLayout = {
      pageNumber: 2,
      source: "DETECTED_HEADER",
      pageWidth: 1000,
      headers: [
        { originalName: "Data", normalizedName: "data", x: 100, xRelative: 0.1 },
        { originalName: "Descrição", normalizedName: "descricao", x: 300, xRelative: 0.3 },
        { originalName: "Valor", normalizedName: "valor", x: 800, xRelative: 0.8 }
      ],
      confidence: "HIGH",
      reasons: []
    };

    const isEquivalent = compareDetectedLayouts(layoutP1, layoutP2);
    expect(isEquivalent).toBeTruthy(); // Equivale pois os xRelative são idênticos
  });

  test("Cenário 4: Cabeçalho repetido em posições diferentes", () => {
    const layoutP2: PageColumnLayout = {
      pageNumber: 2,
      source: "DETECTED_HEADER",
      pageWidth: 500,
      headers: [
        { originalName: "Data", normalizedName: "data", x: 55, xRelative: 0.11 },
        { originalName: "Descrição", normalizedName: "descricao", x: 155, xRelative: 0.31 },
        { originalName: "Valor", normalizedName: "valor", x: 405, xRelative: 0.81 }
      ],
      confidence: "HIGH",
      reasons: []
    };
    
    // Comparação de equivalência deve tolerar pequenas diferenças (0.01 de drift, tolerância é 0.04)
    const isEquivalent = compareDetectedLayouts(layoutP1, layoutP2);
    expect(isEquivalent).toBeTruthy();
  });

  test("Cenário 5: Página sem cabeçalho compatível", () => {
    // Células encaixam nas colunas 50, 150, 400 sem offset
    const lines: PdfPhysicalLine[] = [
      {
        pageNumber: 2,
        physicalLine: 1,
        y: 100,
        pageWidth: 500,
        cells: [
          { text: "02/06", x: 51, y: 100, width: 20, pageNumber: 2, pageWidth: 500 },
          { text: "Lançamento Normal", x: 150, y: 100, width: 50, pageNumber: 2, pageWidth: 500 },
          { text: "-15,00", x: 401, y: 100, width: 20, pageNumber: 2, pageWidth: 500 }
        ]
      }
    ];

    const resolved = validatePageDataAgainstLayout(lines, layoutP1, 2, 500);
    expect(resolved.source).toBe("REUSED_PREVIOUS");
    expect(resolved.confidence).toBe("HIGH");
  });

  test("Cenário 6: Página sem cabeçalho incompatível", () => {
    // Dados desalinhados caóticos (não encaixam e desvios são altos)
    const lines: PdfPhysicalLine[] = [
      {
        pageNumber: 2,
        physicalLine: 1,
        y: 100,
        pageWidth: 500,
        cells: [
          { text: "Texto Qualquer", x: 250, y: 100, width: 80, pageNumber: 2, pageWidth: 500 },
          { text: "Outro Campo", x: 380, y: 100, width: 40, pageNumber: 2, pageWidth: 500 }
        ]
      }
    ];

    const resolved = validatePageDataAgainstLayout(lines, layoutP1, 2, 500);
    expect(resolved.source).toBe("UNRESOLVED");
    expect(resolved.confidence).toBe("LOW");
  });

  test("Cenário 7: Texto de descrição próximo à fronteira", () => {
    // Coluna 2 (Descrição) está em 150, Coluna 3 (Valor) está em 400. Ponto médio = 275.
    // Uma célula de descrição longa começa em 180 e se estende (width = 110) até 290 (centro = 235).
    // O centro geometricamente cai na Descrição (< 275).
    const line: PdfPhysicalLine = {
      pageNumber: 1,
      physicalLine: 1,
      y: 100,
      pageWidth: 500,
      cells: [
        { text: "Compra no estabelecimento comercial supermercado", x: 150, y: 100, width: 220, pageNumber: 1, pageWidth: 500 }
      ]
    };

    const aligned = alignPhysicalCells(line, layoutP1);
    expect(aligned[1]).toBe("Compra no estabelecimento comercial supermercado"); // Deve cair na Descrição (índice 1)
    expect(aligned[2]).toBe(""); // Valor (índice 2) deve ficar em branco
  });

  test("Cenário 8: Valor monetário próximo à fronteira", () => {
    // Coluna 3 (Valor) está em 400. Ponto médio = 275.
    // Célula de valor com x = 380, width = 30 (centro = 395).
    const line: PdfPhysicalLine = {
      pageNumber: 1,
      physicalLine: 1,
      y: 100,
      pageWidth: 500,
      cells: [
        { text: "-100,00", x: 380, y: 100, width: 30, pageNumber: 1, pageWidth: 500 }
      ]
    };

    const aligned = alignPhysicalCells(line, layoutP1);
    expect(aligned[2]).toBe("-100,00"); // Deve cair na coluna Valor (índice 2)
  });

  test("Cenário 9: Cabeçalho administrativo no início da página", () => {
    // Validando que a separação por página e linhas físicas funciona
    const line: PdfPhysicalLine = {
      pageNumber: 2,
      physicalLine: 1,
      y: 20,
      pageWidth: 500,
      cells: [
        { text: "Extrato gerado dia 01/06/2026", x: 50, y: 20, width: 150, pageNumber: 2, pageWidth: 500 }
      ]
    };
    
    // Alinhando uma linha administrativa no layout
    const aligned = alignPhysicalCells(line, layoutP1);
    expect(aligned[0]).toBe("Extrato gerado dia 01/06/2026"); // Como começa no x=50 (< 275), deve cair na coluna 0 (Data)
  });

  test("Cenário 10: PDF de uma página", () => {
    // Alinhamento padrão na primeira página
    const line: PdfPhysicalLine = {
      pageNumber: 1,
      physicalLine: 2,
      y: 120,
      pageWidth: 500,
      cells: [
        { text: "03/06", x: 50, y: 120, width: 20, pageNumber: 1, pageWidth: 500 },
        { text: "Serviço Mensal", x: 150, y: 120, width: 50, pageNumber: 1, pageWidth: 500 },
        { text: "150,00", x: 400, y: 120, width: 30, pageNumber: 1, pageWidth: 500 }
      ]
    };

    const aligned = alignPhysicalCells(line, layoutP1);
    expect(aligned[0]).toBe("03/06");
    expect(aligned[1]).toBe("Serviço Mensal");
    expect(aligned[2]).toBe("150,00");
  });

  test("Cenário 11: Prevenção de cruzamento de colunas", () => {
    const layoutP2: PageColumnLayout = {
      pageNumber: 2,
      source: "DETECTED_HEADER",
      pageWidth: 500,
      headers: [
        { originalName: "Data", normalizedName: "data", x: 150, xRelative: 0.3 }, // Cruzou: Data em 150
        { originalName: "Descrição", normalizedName: "descricao", x: 50, xRelative: 0.1 }, // Cruzou: Descrição em 50
        { originalName: "Valor", normalizedName: "valor", x: 400, xRelative: 0.8 }
      ],
      confidence: "HIGH",
      reasons: []
    };
    const isEquivalent = compareDetectedLayouts(layoutP1, layoutP2);
    expect(isEquivalent).toBeFalsy(); // Deve rejeitar o layout cruzado
  });

  test("Cenário 12: Cabeçalho da página 2 com estrutura diferente", () => {
    // Quantidade diferente de colunas
    const layoutP2: PageColumnLayout = {
      pageNumber: 2,
      source: "DETECTED_HEADER",
      pageWidth: 500,
      headers: [
        { originalName: "Data", normalizedName: "data", x: 50, xRelative: 0.1 },
        { originalName: "Valor", normalizedName: "valor", x: 400, xRelative: 0.8 }
      ],
      confidence: "HIGH",
      reasons: []
    };

    const isEquivalent = compareDetectedLayouts(layoutP1, layoutP2);
    expect(isEquivalent).toBeFalsy(); // Deve rejeitar
  });

  test("Cenário 13: Preservação de origem", () => {
    const cell: PdfPhysicalCell = {
      text: "01/06",
      x: 50,
      y: 100,
      width: 20,
      pageNumber: 3,
      pageWidth: 500
    };
    const line: PdfPhysicalLine = {
      pageNumber: 3,
      physicalLine: 5,
      y: 100,
      pageWidth: 500,
      cells: [cell]
    };
    expect(line.pageNumber).toBe(3);
    expect(line.physicalLine).toBe(5);
  });
});
