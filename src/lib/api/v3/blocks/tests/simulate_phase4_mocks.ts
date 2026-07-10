import { assembleBlocks, BlockLineMetadata } from "../blockAssembler";

console.log("=== SIMULANDO EFEITOS DO BLOCK_ASSEMBLER (FASE 4) ===");

const parseDate = (s: string) => {
  if (/\b\d{2}\/\d{2}(\/\d{2,4})?\b/.test(s)) return s;
  return null;
};

// 1. Amostra Nubank: 2 transações, uma delas multilinha
console.log("\n--- Amostra Nubank Nativo ---");
const bodyMatrixA = [
  ["01/06/2026", "Resgate RDB", "100,00"],
  ["02/06/2026", "PIX enviado para Banco Itaú", "-50,00"],
  ["", "João da Silva", ""],
  ["", "João da Silva", ""] // Repetição literal consecutiva para testar deduplicação
];
const metadataA: BlockLineMetadata[] = [
  { pageNumber: 1, physicalLine: 1 },
  { pageNumber: 1, physicalLine: 2 },
  { pageNumber: 1, physicalLine: 3 },
  { pageNumber: 1, physicalLine: 4 }
];

const resA = assembleBlocks({
  bodyMatrix: bodyMatrixA,
  dateIdx: 0,
  valueIdxs: [2],
  descIdx: 1,
  parseDate,
  lineMetadata: metadataA
});

console.log("Linhas de entrada:", bodyMatrixA.length);
console.log("Blocos gerados:", resA.merged.length);
resA.merged.forEach((row, i) => {
  console.log(`Bloco ${i + 1}: Data: ${row[0]} | Descrição: [${row[1]}] | Valor: ${row[2]}`);
});

// 2. Amostra Inter: Dados multilinha com agência/conta na continuação
console.log("\n--- Amostra Inter Nativo ---");
const bodyMatrixB = [
  ["05/06/2026", "TED Recebida", "500,00"],
  ["", "Banco Inter Ag 0001 Conta 9999", ""]
];
const metadataB: BlockLineMetadata[] = [
  { pageNumber: 1, physicalLine: 1 },
  { pageNumber: 1, physicalLine: 2 }
];

const resB = assembleBlocks({
  bodyMatrix: bodyMatrixB,
  dateIdx: 0,
  valueIdxs: [2],
  descIdx: 1,
  parseDate,
  lineMetadata: metadataB
});

console.log("Linhas de entrada:", bodyMatrixB.length);
console.log("Blocos gerados:", resB.merged.length);
resB.merged.forEach((row, i) => {
  console.log(`Bloco ${i + 1}: Data: ${row[0]} | Descrição: [${row[1]}] | Valor: ${row[2]}`);
});
