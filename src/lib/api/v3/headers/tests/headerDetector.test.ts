import { detectHeader } from "../headerDetector";
import { mapHeaders } from "../index";

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
    console.error(err);
    process.exit(1);
  }
}

const expect = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    }
  },
  toBeUndefined: () => {
    if (actual !== undefined) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be undefined`);
    }
  },
  toBeGreaterThanOrEqual: (expected: number) => {
    if (typeof actual !== "number" || actual < expected) {
      throw new Error(`Expected ${actual} to be >= ${expected}`);
    }
  }
});

describe("SIE V3 Header Detector & Scorer Test Suite", () => {

  test("Cenário CT-01: Extrato Nubank PDF com metadados no topo", () => {
    const matrix = [
      ["NUBANK S.A.", "CNPJ: 18.236.464/0001-02"],
      ["Nome do Cliente: Maria da Silva", "CPF: 123.456.789-00"],
      ["Agência: 0001", "Conta: 987654-3"],
      ["Data", "Descrição", "Valor"], // Linha 4 (Index 3)
      ["01/01/2026", "Pix Recebido - João", "150,00"],
      ["02/01/2026", "Tarifa de Conta", "-10,00"]
    ];

    const result = detectHeader(matrix, "pdf");
    expect(result.headerFailed).toBeUndefined();
    expect(result.headerIndex).toBe(3);
    expect(result.confidence).toBeGreaterThanOrEqual(0.60);

    const mapping = mapHeaders(result.headers);
    expect(mapping.map.transaction_date).toBe("Data");
    expect(mapping.map.description).toBe("Descrição");
    expect(mapping.map.amount).toBe("Valor");
  });

  test("Cenário CT-02: Extrato Itaú com 'Valor Movimento'", () => {
    const matrix = [
      ["ITAÚ UNIBANCO S.A."],
      ["Extrato de Período: Janeiro 2026"],
      ["Data", "Lançamento", "Valor Movimento", "Saldo"], // Linha 3 (Index 2)
      ["01/01/2026", "Compra Cartão", "-42,90", "1.000,00"]
    ];

    const result = detectHeader(matrix, "pdf");
    expect(result.headerFailed).toBeUndefined();
    expect(result.headerIndex).toBe(2);

    const mapping = mapHeaders(result.headers);
    expect(mapping.map.transaction_date).toBe("Data");
    expect(mapping.map.description).toBe("Lançamento");
    expect(mapping.map.amount).toBe("Valor Movimento");
    expect(mapping.map.balance).toBe("Saldo");
  });

  test("Cenário CT-03: Extrato Banco Inter com colunas separadas e parênteses", () => {
    const matrix = [
      ["BANCO INTER S.A."],
      ["Data Lançamento", "Histórico", "Valor (R$)", "Saldo"],
      ["05/01/2026", "Pix Enviado - Jose", "-300,00", "500,00"]
    ];

    const result = detectHeader(matrix, "csv");
    expect(result.headerFailed).toBeUndefined();
    expect(result.headerIndex).toBe(1);

    const mapping = mapHeaders(result.headers);
    expect(mapping.map.transaction_date).toBe("Data Lançamento");
    expect(mapping.map.description).toBe("Histórico");
    expect(mapping.map.amount).toBe("Valor (R$)");
  });

  test("Cenário CT-04: Extrato Banco do Brasil", () => {
    const matrix = [
      ["BANCO DO BRASIL S.A."],
      ["Data Movimento", "Histórico", "Documento", "Valor", "Saldo"],
      ["10/01/2026", "TED Recebida", "123456", "1.200,00", "2.200,00"]
    ];

    const result = detectHeader(matrix, "xlsx");
    expect(result.headerFailed).toBeUndefined();
    expect(result.headerIndex).toBe(1);

    const mapping = mapHeaders(result.headers);
    expect(mapping.map.transaction_date).toBe("Data Movimento");
    expect(mapping.map.description).toBe("Histórico");
    expect(mapping.map.document_number).toBe("Documento");
    expect(mapping.map.amount).toBe("Valor");
    expect(mapping.map.balance).toBe("Saldo");
  });

  test("Cenário CT-05: Extrato Bradesco com colunas Crédito/Débito", () => {
    const matrix = [
      ["BANCO BRADESCO S.A."],
      ["Agência/Conta: 1234/56789-0"],
      ["Data", "Histórico", "Docto.", "Crédito (R$)", "Débito (R$)", "Saldo"],
      ["15/01/2026", "Depósito Dinheiro", "9988", "500,00", "", "3.000,00"]
    ];

    const result = detectHeader(matrix, "pdf");
    expect(result.headerFailed).toBeUndefined();
    expect(result.headerIndex).toBe(2);

    const mapping = mapHeaders(result.headers);
    expect(mapping.map.transaction_date).toBe("Data");
    expect(mapping.map.description).toBe("Histórico");
    expect(mapping.map.document_number).toBe("Docto.");
    expect(mapping.map.credit_amount).toBe("Crédito (R$)");
    expect(mapping.map.debit_amount).toBe("Débito (R$)");
    expect(mapping.map.balance).toBe("Saldo");
  });

  test("Cenário CT-06: Extrato Caixa Econômica", () => {
    const matrix = [
      ["CAIXA ECONÔMICA FEDERAL"],
      ["Data Mov.", "Nr. Doc.", "Histórico", "Valor", "Saldo"],
      ["20/01/2026", "112233", "Pagamento Boleto", "-150,00", "850,00"]
    ];

    const result = detectHeader(matrix, "csv");
    expect(result.headerFailed).toBeUndefined();
    expect(result.headerIndex).toBe(1);

    const mapping = mapHeaders(result.headers);
    expect(mapping.map.transaction_date).toBe("Data Mov.");
    expect(mapping.map.document_number).toBe("Nr. Doc.");
    expect(mapping.map.description).toBe("Histórico");
    expect(mapping.map.amount).toBe("Valor");
    expect(mapping.map.balance).toBe("Saldo");
  });

  test("Cenário CT-07: Mercado Pago com nomenclatura própria", () => {
    const matrix = [
      ["MERCADO PAGO IP LTDA"],
      ["Data da Operação", "Descrição da Transação", "Valor da Transação", "Método"],
      ["22/01/2026", "Venda de Serviço", "120,00", "PIX"]
    ];

    const result = detectHeader(matrix, "pdf");
    expect(result.headerFailed).toBeUndefined();
    expect(result.headerIndex).toBe(1);

    const mapping = mapHeaders(result.headers);
    expect(mapping.map.transaction_date).toBe("Data da Operação");
    expect(mapping.map.description).toBe("Descrição da Transação");
    expect(mapping.map.amount).toBe("Valor da Transação");
    expect(mapping.map.movement_type).toBe("Método");
  });

  test("Cenário CT-08: Tolerância a ruídos de OCR (Fuzzy / Normalized)", () => {
    const matrix = [
      ["EXTRATO GERADO EM IMAGEM COM ERROS"],
      ["DatA", "Descriçao", "Val0r"], // Erros de caixa, acento e caractere numérico no lugar de letra
      ["25/01/2026", "Aporte de Capital", "5000,00"]
    ];

    const result = detectHeader(matrix, "pdf_ocr");
    expect(result.headerFailed).toBeUndefined();
    expect(result.headerIndex).toBe(1);

    const mapping = mapHeaders(result.headers);
    expect(mapping.map.transaction_date).toBe("DatA");
    expect(mapping.map.description).toBe("Descriçao");
    expect(mapping.map.amount).toBe("Val0r");
  });

  test("Cenário CT-09: Rejeição por confiança insuficiente (Falta campos essenciais)", () => {
    const matrix = [
      ["CLIENTES RECENTES"],
      ["Nome completo", "Telefone", "E-mail"], // Tem 3 colunas, mas não tem data nem valor transacional
      ["Carlos Silva", "11999998888", "carlos@email.com"]
    ];

    const result = detectHeader(matrix, "csv");
    // Deve falhar o threshold por falta de campos financeiros básicos (date, amount)
    expect(result.headerFailed).toBe(true);
    expect(result.headerIndex).toBe(-1);
  });
});
