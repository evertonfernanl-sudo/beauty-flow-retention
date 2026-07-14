import { classifyPage } from "../pageClassifier";

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
  }
});

describe("pageClassifier Test Suite", () => {
  test("Cenário 1: Página vazia (sem items) -> IMAGE", () => {
    expect(classifyPage([])).toBe("IMAGE");
    expect(classifyPage(null as any)).toBe("IMAGE");
  });

  test("Cenário 2: Página com apenas espaços em branco -> IMAGE", () => {
    expect(classifyPage([{ str: "   " }, { str: "\n\t" }])).toBe("IMAGE");
  });

  test("Cenário 3: Página com apenas 1 caractere útil -> NATIVE", () => {
    expect(classifyPage([{ str: "a" }])).toBe("NATIVE");
  });

  test("Cenário 4: Página com múltiplos caracteres úteis -> NATIVE", () => {
    expect(classifyPage([{ str: "abcde" }])).toBe("NATIVE");
    expect(classifyPage([{ str: "12" }, { str: "345" }])).toBe("NATIVE");
  });

  test("Cenário 5: Página típica de extrato nativo -> NATIVE", () => {
    expect(classifyPage([
      { str: "Extrato Bancário" },
      { str: "Data: 10/10/2026" },
      { str: "Lançamento: Recebimento" }
    ])).toBe("NATIVE");
  });
});
