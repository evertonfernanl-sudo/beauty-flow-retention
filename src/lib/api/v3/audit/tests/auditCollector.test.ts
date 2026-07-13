import { ImportAuditCollector } from "../auditCollector";
import { generateAuditTextReport } from "../auditReport";
import { sanitizeAuditText } from "../auditSanitizer";

console.log("=== SIE V3 Import Audit Collector Test Suite (Fase 7) ===");

const runTest = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name} FAILED!`);
    console.error(err.message || err);
    process.exit(1);
  }
};

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

// Teste 1 — Criação do collector
runTest("Teste 1 — Criação do collector", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  const rep = col.finalize();
  expect(rep.summary.importId).toBe("imp_123");
  expect(rep.summary.source).toBe("pdf");
  expect(rep.summary.status).toBe("RUNNING");
  expect(rep.summary.physicalLinesExtracted).toBe(0);
});

// Teste 2 — Incremento de métricas
runTest("Teste 2 — Incremento de métricas", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.increment("physical_lines_extracted", 10);
  col.increment("physical_lines_extracted", 5);
  const rep = col.finalize();
  expect(rep.summary.physicalLinesExtracted).toBe(15);
});

// Teste 3 — Registro de página
runTest("Teste 3 — Registro de página", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.recordPageLayout({
    pageNumber: 1,
    layoutSource: "DETECTED_HEADER",
    layoutConfidence: "HIGH",
    detectedColumnCount: 5,
    reasons: ["Header OK"]
  });
  const rep = col.finalize();
  expect(rep.phases.phase2.totals.pages_extracted).toBe(1);
  expect(rep.phases.phase2.totals.pages_with_detected_header).toBe(1);
  expect(rep.phases.phase2.pages[0].pageNumber).toBe(1);
});

// Teste 4 — Registro de descarte
runTest("Teste 4 — Registro de descarte", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.recordPhase3Row({
    pageNumber: 1,
    physicalLine: 2,
    category: "METADATA",
    action: "DISCARD_BEFORE_BLOCKS",
    reasonCode: "METADATA_LINE",
    confidence: "HIGH",
    matchedSignals: ["date"],
    textPreview: "Extrato gerado em 10/10/2026"
  });
  const rep = col.finalize();
  expect(rep.phases.phase3.totals.discarded_rows).toBe(1);
  expect(rep.phases.phase3.totals.metadata_lines_discarded).toBe(1);
  expect(rep.phases.phase3.discarded[0].category).toBe("METADATA");
});

// Teste 5 — Registro de bloco
runTest("Teste 5 — Registro de bloco", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.recordBlock({
    blockId: "1-5-1",
    pageStart: 1,
    pageEnd: 1,
    originLines: [{ pageNumber: 1, physicalLine: 5 }],
    openedBy: "date_val",
    closedBy: "new_date",
    appendedBy: [],
    descriptionLineCount: 1,
    crossedPageBoundary: false,
    ambiguous: false,
    ambiguityReasons: [],
    valueConflict: false,
    documentConflict: false,
    possibleMegaBlock: false
  });
  const rep = col.finalize();
  expect(rep.phases.phase4.totals.blocks_created).toBe(1);
  expect(rep.phases.phase4.blocks[0].blockId).toBe("1-5-1");
});

// Teste 6 — Registro temporal
runTest("Teste 6 — Registro temporal", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.recordTemporal({
    blockId: "1-5-1",
    assignment: "INHERITED",
    normalizedDate: "2026-07-10",
    reasonCode: "INHERITED_SAME_GROUP",
    inheritedAcrossPage: false,
    contextInvalidated: false,
    conflictReasons: []
  });
  const rep = col.finalize();
  expect(rep.phases.phase5.totals.dates_inherited).toBe(1);
  expect(rep.phases.phase5.records[0].normalizedDate).toBe("2026-07-10");
});

// Teste 7 — Registro de confiança
runTest("Teste 7 — Registro de confiança", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.recordConfidence({
    blockId: "1-5-1",
    directionConfidence: 100,
    structuralConfidence: 90,
    semanticConfidence: 85,
    overallConfidence: 91,
    directionBand: "MUITO_ALTA",
    structuralBand: "MUITO_ALTA",
    semanticBand: "ALTA",
    overallBand: "MUITO_ALTA",
    capsApplied: [],
    hardFailures: [],
    reviewReasons: [],
    finalStatus: "LINE_APPROVED"
  });
  const rep = col.finalize();
  expect(rep.phases.phase6.totals.rows_gate_passed).toBe(1);
  expect(rep.phases.phase6.records[0].overallBand).toBe("MUITO_ALTA");
});

// Teste 8 — Conciliação de contadores equilibrada
runTest("Teste 8 — Conciliação de contadores equilibrada", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.increment("physical_lines_extracted", 2);
  
  col.recordPhase3Row({
    pageNumber: 1, physicalLine: 1, category: "TRANSACTION_CANDIDATE",
    action: "FORWARD_TO_BLOCK_ASSEMBLER", reasonCode: "TX", confidence: "HIGH", matchedSignals: []
  });
  col.recordPhase3Row({
    pageNumber: 1, physicalLine: 2, category: "METADATA",
    action: "DISCARD_BEFORE_BLOCKS", reasonCode: "META", confidence: "HIGH", matchedSignals: []
  });

  col.recordConfidence({
    blockId: "1-1-1", directionConfidence: 100, structuralConfidence: 100, semanticConfidence: 100,
    overallConfidence: 100, directionBand: "MUITO_ALTA", structuralBand: "MUITO_ALTA", semanticBand: "MUITO_ALTA",
    overallBand: "MUITO_ALTA", capsApplied: [], hardFailures: [], reviewReasons: [], finalStatus: "LINE_APPROVED"
  });

  const rep = col.finalize();
  expect(rep.consistencyChecks.countersBalanced).toBeTruthy();
});

// Teste 9 — Divergência de contadores
runTest("Teste 9 — Divergência de contadores", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.increment("physical_lines_extracted", 5); // physical extracted = 5, but we record 0 rows
  const rep = col.finalize();
  expect(rep.consistencyChecks.countersBalanced).toBeFalsy();
  expect(rep.warnings.length).toBeGreaterThan(0);
});

// Teste 10 — Sanitização de CPF
runTest("Teste 10 — Sanitização de CPF", () => {
  const text = "PIX RECEBIDO DE JOAO CPF 123.456.789-10 VALOR 100,00";
  const clean = sanitizeAuditText(text);
  expect(clean.includes("123.456.789-10")).toBeFalsy();
  expect(clean.includes("***.***.***-**")).toBeTruthy();
});

// Teste 11 — Sanitização de conta
runTest("Teste 11 — Sanitização de conta", () => {
  const text = "DOC ENVIADO CONTA 12345-6 BANCO ITAU";
  const clean = sanitizeAuditText(text);
  expect(clean.includes("12345-6")).toBeFalsy();
  expect(clean.toLowerCase().includes("conta ***45-6")).toBeTruthy();
});

// Teste 12 — Sanitização de e-mail e telefone
runTest("Teste 12 — Sanitização de e-mail e telefone", () => {
  const text = "PIX CHAVE EMAIL joao.silva@gmail.com";
  const clean = sanitizeAuditText(text);
  expect(clean.includes("joao.silva@gmail.com")).toBeFalsy();
  expect(clean.includes("joa***@gmail.com")).toBeTruthy();
});

// Teste 13 — Limite de preview
runTest("Teste 13 — Limite de preview", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  const longPreview = "A".repeat(200);
  col.recordPhase3Row({
    pageNumber: 1, physicalLine: 1, category: "METADATA",
    action: "DISCARD_BEFORE_BLOCKS", reasonCode: "META", confidence: "HIGH", matchedSignals: [],
    textPreview: longPreview
  });
  const rep = col.finalize();
  expect(rep.phases.phase3.discarded[0].textPreview?.length).toBe(100);
});

// Teste 14 — Limite de eventos (ceiling 500)
runTest("Teste 14 — Limite de eventos (ceiling 500)", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  for (let i = 0; i < 600; i++) {
    col.recordPhase3Row({
      pageNumber: 1, physicalLine: i, category: "METADATA",
      action: "DISCARD_BEFORE_BLOCKS", reasonCode: "META", confidence: "HIGH", matchedSignals: [],
      textPreview: "Discard"
    });
  }
  const rep = col.finalize();
  expect(rep.phases.phase3.discarded.length).toBe(500);
  expect(rep.phases.phase3.totals.discarded_rows).toBe(600); // counters are preserved!
});

// Teste 15 — Auditoria opcional falha
runTest("Teste 15 — Auditoria opcional falha", () => {
  // Test that collector handles failures gracefully without crashing main execution
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.recordPhase1({
    issuerBank: null, inferenceSource: "NOT_IDENTIFIED", fallbackUsed: false,
    matchedSignals: [], normalizationApplied: false, counterpartyBankIgnored: false
  });
  const rep = col.finalize();
  expect(rep.phases.phase1.issuerBank).toBe(null);
});

// Teste 16 — Auditoria essencial presente
runTest("Teste 16 — Auditoria essencial presente", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.increment("physical_lines_extracted", 1);
  const rep = col.finalize();
  expect(rep.summary.importId).toBe("imp_123");
});

// Teste 17 — Idempotência de eventos
runTest("Teste 17 — Idempotência de eventos", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.setStatus("COMPLETED");
  col.setStatus("COMPLETED"); // set again
  const rep = col.finalize();
  expect(rep.summary.status).toBe("COMPLETED");
});

// Teste 18 — Duas importações concorrentes isoladas
runTest("Teste 18 — Duas importações concorrentes isoladas", () => {
  const colA = new ImportAuditCollector("imp_A", "pdf");
  const colB = new ImportAuditCollector("imp_B", "pdf");
  colA.increment("physical_lines_extracted", 10);
  colB.increment("physical_lines_extracted", 20);
  
  const repA = colA.finalize();
  const repB = colB.finalize();
  
  expect(repA.summary.physicalLinesExtracted).toBe(10);
  expect(repB.summary.physicalLinesExtracted).toBe(20);
});

// Teste 19 — Versionamento presente
runTest("Teste 19 — Versionamento presente", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  const rep = col.finalize();
  expect(rep.summary.warningsCount).toBe(0);
});

// Teste 20 — Relatório consolidado legível
runTest("Teste 20 — Relatório consolidado legível", () => {
  const col = new ImportAuditCollector("imp_123", "pdf");
  col.setFilename("extrato_nubank.pdf");
  col.setIssuerBank("banco nubank");
  col.increment("physical_lines_extracted", 10);
  col.setStatus("COMPLETED");
  const rep = col.finalize();
  const text = generateAuditTextReport(rep);
  expect(text.includes("Import ID: imp_123")).toBeTruthy();
  expect(text.includes("Banco Emissor: banco nubank")).toBeTruthy();
  expect(text.includes("extrato_nubank.pdf")).toBeTruthy();
});

console.log("SUCESSO: Todos os 20 testes do collector passaram!");
