import { parseBrazilianMoney } from "../../parsing/moneyParser";
import { extractDate } from "../../enrichment/dateExtractor";

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

describe("Ported Rules Test Suite", () => {
  describe("parseBrazilianMoney", () => {
    test("Cenário 1: Valor positivo padrão brasileiro", () => {
      const res = parseBrazilianMoney("1.250,55");
      expect(res.value).toBe(1250.55);
      expect(res.sign).toBe("POSITIVE");
    });

    test("Cenário 2: Valor negativo com hífen no início", () => {
      const res = parseBrazilianMoney("-120,00");
      expect(res.value).toBe(-120);
      expect(res.sign).toBe("NEGATIVE");
    });

    test("Cenário 3: Valor negativo com hífen e cifrão", () => {
      const res = parseBrazilianMoney("R$ - 150,40");
      expect(res.value).toBe(-150.40);
      expect(res.sign).toBe("NEGATIVE");
    });

    test("Cenário 4: Valor negativo com parênteses", () => {
      const res = parseBrazilianMoney("(250,00)");
      expect(res.value).toBe(-250);
      expect(res.sign).toBe("NEGATIVE");
    });

    test("Cenário 5: Valor negativo com letra D no final", () => {
      const res = parseBrazilianMoney("300,00 D");
      expect(res.value).toBe(-300);
      expect(res.sign).toBe("NEGATIVE");
    });
  });

  describe("extractDate", () => {
    test("Cenário 1: Data formato BR padrão DD/MM/YYYY", () => {
      expect(extractDate("14/07/2026")).toBe("2026-07-14");
    });

    test("Cenário 2: Data formato BR sem ano DD/MM", () => {
      const currentYear = new Date().getFullYear();
      expect(extractDate("14/07")).toBe(`${currentYear}-07-14`);
    });

    test("Cenário 3: Data com mês textual e ano", () => {
      expect(extractDate("15 de Março de 2026")).toBe("2026-03-15");
      expect(extractDate("01 JAN 2026")).toBe("2026-01-01");
      expect(extractDate("25-Abr-26")).toBe("2026-04-25");
    });

    test("Cenário 4: Data formato ISO YYYY-MM-DD", () => {
      expect(extractDate("2026-07-14")).toBe("2026-07-14");
    });
  });
});
