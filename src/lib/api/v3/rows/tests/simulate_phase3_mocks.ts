import { classifyNonTransactionalRow, AlignedRow, RowClassificationContext } from "../nonTransactionalClassifier";

console.log("=== SIMULANDO CLASSIFICACAO E FILTRAGEM DA FASE 3 ===");

const contextPdf: RowClassificationContext = { source: "pdf", pageNumber: 1, physicalLine: 1 };

const mockFiles = [
  {
    name: "Arquivo A (Nubank Nativo)",
    rows: [
      ["Nu Pagamentos S.A.", "", ""],
      ["Extrato gerado dia 10/06/2026", "", ""],
      ["Valores em R$", "", ""],
      ["Agência 0001 - Conta 12345-6", "", ""],
      ["Data", "Descrição", "Valor"],
      ["01/06/2026", "Resgate RDB", "100,00"],
      ["02/06/2026", "PIX enviado para Banco Itaú", "-50,00"],
      ["", "João da Silva", ""],
      ["Saldo do dia", "1.000,00", ""],
      ["SAC 0800 000 0000", "", ""]
    ]
  },
  {
    name: "Arquivo B (Inter Nativo)",
    rows: [
      ["DADOS INICIAIS DO TITULAR", "", ""],
      ["Nome do titular: Fulano de Tal", "", ""],
      ["CPF: 000.000.000-00", "", ""],
      ["Conta: 1234567-8", "", ""],
      ["Data", "Histórico", "Valor"],
      ["05/06/2026", "TED Recebida", "500,00"],
      ["", "Banco Inter Ag 0001 Conta 9999", ""],
      ["Total de débitos", "1.500,00", ""]
    ]
  },
  {
    name: "Arquivo D (Bradesco Nativo)",
    rows: [
      ["Bradesco Celular", "", ""],
      ["Últimos lançamentos", "", ""],
      ["Data | Histórico | Valor", "", ""],
      ["05/06/2026", "Tarifa Bancária", "-15,00"],
      ["Resumo do período", "", ""],
      ["Saldo inicial", "100,00", ""],
      ["Saldo final", "85,00", ""]
    ]
  }
];

for (const file of mockFiles) {
  console.log(`\n--- ${file.name} ---`);
  let received = 0;
  let forwarded = 0;
  let discarded = 0;
  let captured = 0;

  for (let idx = 0; idx < file.rows.length; idx++) {
    const row = file.rows[idx];
    received++;
    const res = classifyNonTransactionalRow(row, {
      ...contextPdf,
      physicalLine: idx + 1
    });

    console.log(`Linha ${idx + 1}: [${row.filter(Boolean).join(" | ")}]`);
    console.log(`  -> Categoria: ${res.category} | Ação: ${res.action} (Motivo: ${res.reasonCode})`);

    if (res.action === "FORWARD_TO_BLOCK_ASSEMBLER" || res.action === "KEEP_FOR_REVIEW") {
      forwarded++;
    } else if (res.action === "DISCARD_BEFORE_BLOCKS") {
      discarded++;
    } else {
      captured++;
    }
  }

  console.log(`Estatísticas: Recebidas: ${received} | Encaminhadas: ${forwarded} | Discartadas: ${discarded} | Capturadas: ${captured}`);
}
