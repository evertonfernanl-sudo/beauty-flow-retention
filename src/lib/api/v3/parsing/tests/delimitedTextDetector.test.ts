import { detectDelimitedTextStructure } from "../delimitedTextDetector";

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
  }
});

describe("SIE V3 Delimited Text Structure Detector Test Suite", () => {
  test("Cenário 1: Separador ponto e vírgula (;)", () => {
    const csv = `Data;Descrição;Valor;Saldo\n01/06/2026;Pix recebido;150,00;150,00\n02/06/2026;Tarifa bancária;-10,00;140,00`;
    const res = detectDelimitedTextStructure(csv);
    expect(res.delimiter).toBe(";");
    expect(res.confidence).toBe("HIGH");
    expect(res.expectedColumnCount).toBe(4);
  });

  test("Cenário 2: Separador vírgula com decimais entre aspas", () => {
    const csv = `Data,Descrição,Valor,Saldo\n01/06/2026,Pix recebido,"150,00","150,00"\n02/06/2026,Tarifa bancária,"-10,00","140,00"`;
    const res = detectDelimitedTextStructure(csv);
    expect(res.delimiter).toBe(",");
    expect(res.confidence).toBe("HIGH");
    expect(res.expectedColumnCount).toBe(4);
  });

  test("Cenário 3: Separador tabulação (\\t)", () => {
    const csv = `Data\tDescrição\tValor\tSaldo\n01/06/2026\tPix recebido\t150,00\t150,00`;
    const res = detectDelimitedTextStructure(csv);
    expect(res.delimiter).toBe("\t");
    expect(res.expectedColumnCount).toBe(4);
  });

  test("Cenário 4: Vírgula decimal com ponto e vírgula de delimitador", () => {
    const csv = `Data;Descrição;Valor\n01/06/2026;Pix;1.250,55\n02/06/2026;Tarifa;-10,00`;
    const res = detectDelimitedTextStructure(csv);
    expect(res.delimiter).toBe(";");
    expect(res.expectedColumnCount).toBe(3);
  });

  test("Cenário 5: Linha inconsistente", () => {
    const csv = `Data;Descrição\n01/06/2026;Pix;150,00;Extra;Campos\n02/06/2026`;
    const res = detectDelimitedTextStructure(csv);
    // Deve identificar ";" mas com confiança média ou baixa
    expect(res.delimiter).toBe(";");
    expect(res.confidence).toBe("LOW");
  });

  test("Cenário 6: Cabeçalho com 7 colunas", () => {
    const csv = `Data;Histórico;Docto;Favorecido;CPF/CNPJ;Valor;Saldo\n01/06/2026;Pix;123;João;000;10,00;10,00`;
    const res = detectDelimitedTextStructure(csv);
    expect(res.delimiter).toBe(";");
    expect(res.expectedColumnCount).toBe(7);
  });

  test("Cenário 7: Vírgula decimal sem aspas (evitar que vírgula seja delimitador)", () => {
    // Se o delimitador for "," e houver vírgula decimal sem aspas, deve pontuar ";" melhor ou penalizar ","
    const csv = `Data;Descrição;Valor\n01/06/2026;Pix recebido;150,00\n02/06/2026;Tarifa;-10,00`;
    const res = detectDelimitedTextStructure(csv);
    expect(res.delimiter).toBe(";");
  });

  test("Cenário 8: Fallback seguro se não houver delimitador válido", () => {
    const csv = `Apenas texto corrido sem nenhum separador especial\nOutra linha sem nada`;
    const res = detectDelimitedTextStructure(csv);
    expect(res.delimiter).toBe(null);
    expect(res.confidence).toBe("LOW");
  });
});
