import { parseBrazilianMoney } from "../moneyParser";

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

describe("SIE V3 Money Parser & Sign Detector Test Suite", () => {
  test("Cenários de valores negativos", () => {
    expect(parseBrazilianMoney("-100,00").value).toBe(-100);
    expect(parseBrazilianMoney("-100,00").sign).toBe("NEGATIVE");

    expect(parseBrazilianMoney("- 100,00").value).toBe(-100);
    expect(parseBrazilianMoney("R$ -100,00").value).toBe(-100);
    expect(parseBrazilianMoney("R$ - 100,00").value).toBe(-100);
    expect(parseBrazilianMoney("100,00-").value).toBe(-100);
    expect(parseBrazilianMoney("(100,00)").value).toBe(-100);
    expect(parseBrazilianMoney("R$ (100,00)").value).toBe(-100);
    expect(parseBrazilianMoney("-1.234,56").value).toBe(-1234.56);
    expect(parseBrazilianMoney("350,00 D").value).toBe(-350);
  });

  test("Cenários de valores positivos e zero", () => {
    expect(parseBrazilianMoney("0,00").value).toBe(0);
    expect(parseBrazilianMoney("0,00").sign).toBe("ZERO");

    expect(parseBrazilianMoney("R$ 100,00").value).toBe(100);
    expect(parseBrazilianMoney("R$ 100,00").sign).toBe("POSITIVE");

    expect(parseBrazilianMoney("1.234,56").value).toBe(1234.56);
    expect(parseBrazilianMoney("1234.56").value).toBe(1234.56);
  });

  test("Cenários inválidos e de borda", () => {
    expect(parseBrazilianMoney("texto inválido").value).toBe(null);
    expect(parseBrazilianMoney("texto inválido").reasonCode).toBe("INVALID_NUMBER");

    expect(parseBrazilianMoney(null).value).toBe(null);
    expect(parseBrazilianMoney(null).reasonCode).toBe("NULL_OR_UNDEFINED");

    expect(parseBrazilianMoney("").value).toBe(null);
    expect(parseBrazilianMoney("").reasonCode).toBe("EMPTY_STRING");
  });
});
