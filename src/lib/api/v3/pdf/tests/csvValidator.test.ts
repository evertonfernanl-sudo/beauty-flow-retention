import { validateCanonicalCsv } from "../../parsing/csvValidator";

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
  toBeTrue: () => {
    if (actual !== true) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be true`);
    }
  },
  toBeFalse: () => {
    if (actual !== false) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be false`);
    }
  }
});

describe("csvValidator Test Suite", () => {
  const validHeader = "date;description;amount;debit;credit;balance;doc;client_name;cpf_cnpj;phone;movement_type;page;origin_lines";

  test("Cenário 1: CSV válido de 1 linha transacional", () => {
    const csv = `${validHeader}\n2026-07-14;Pix recebido;150,00;;;1000,00;123;Maria;123.456.789-00;11999999999;PIX;1;["1:12"]`;
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeTrue();
    expect(res.errors.length).toBe(0);
  });

  test("Cenário 2: Erro se CSV vazio", () => {
    const res = validateCanonicalCsv("");
    expect(res.valid).toBeFalse();
    expect(res.errors[0].error.includes("vazio")).toBeTrue();
  });

  test("Cenário 3: Erro se cabeçalho incorreto", () => {
    const csv = "data;description;amount\n2026-07-14;Pix;150,00";
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeFalse();
    expect(res.errors[0].error.includes("cabeçalho")).toBeTrue();
  });

  test("Cenário 4: Erro se contagem de colunas na linha de dados for inválida", () => {
    const csv = `${validHeader}\n2026-07-14;Pix;150,00;;;;;1`;
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeFalse();
    expect(res.errors[0].error.includes("colunas")).toBeTrue();
  });

  test("Cenário 5: Erro se data não for YYYY-MM-DD", () => {
    const csv = `${validHeader}\n14/07/2026;Pix recebido;150,00;;;1000,00;123;Maria;123.456.789-00;11999999999;PIX;1;["1:12"]`;
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeFalse();
    expect(res.errors[0].column).toBe("date");
    expect(res.errors[0].error.includes("Data com formato inválido")).toBeTrue();
  });

  test("Cenário 6: Erro se valor monetário não usar vírgula decimal", () => {
    const csv = `${validHeader}\n2026-07-14;Pix recebido;150.00;;;1000,00;123;Maria;123.456.789-00;11999999999;PIX;1;["1:12"]`;
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeFalse();
    expect(res.errors[0].column).toBe("amount");
    expect(res.errors[0].error.includes("brasileira")).toBeTrue();
  });

  test("Cenário 7: Suporte a aspas e delimitadores escapados (RFC 4180)", () => {
    const csv = `${validHeader}\n2026-07-14;"Pix recebido; de João ""Silva""";150,00;;;1000,00;123;Maria;123.456.789-00;11999999999;PIX;1;"[""1:12""]"`;
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeTrue();
  });

  test("Cenário 8: Erro se origin_lines não for formato [\"page:line\"]", () => {
    const csv = `${validHeader}\n2026-07-14;Pix recebido;150,00;;;1000,00;123;Maria;123.456.789-00;11999999999;PIX;1;[12]`;
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeFalse();
    expect(res.errors[0].column).toBe("origin_lines");
  });

  test("Cenário 9: Sucesso com valor monetário positivo com sinal '+'", () => {
    const csv = `${validHeader}\n2026-07-14;Pix recebido;+170,00;;;1000,00;123;Maria;123.456.789-00;11999999999;PIX;1;["1:12"]`;
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeTrue();
    expect(res.errors.length).toBe(0);
  });

  test("Cenário 10: Sucesso com valores monetários contendo R$, sufixos D/C e espaços", () => {
    const csv = `${validHeader}\n2026-07-14;Compra;-R$ 295,39;300,00 C;150,00 D;R$ 1.000,00;123;Maria;123.456.789-00;11999999999;PIX;1;["1:12"]`;
    const res = validateCanonicalCsv(csv);
    expect(res.valid).toBeTrue();
    expect(res.errors.length).toBe(0);
  });
});
