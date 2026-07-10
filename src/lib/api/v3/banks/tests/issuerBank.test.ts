import {
  inferIssuerBank,
  normalizeIssuerBankName,
  IssuerBank
} from "../issuerBank";
import { validateCanonicalConsistency } from "../../enrichment/consistencyValidator";
import { CanonicalRow } from "../../pipeline.server";

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
  toBeNull: () => {
    if (actual !== null) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be null`);
    }
  }
});

describe("SIE V3 Bank Inference & Normalization Test Suite", () => {

  test("Cenário 1: Identidade Nubank", () => {
    const sample = "Nu Pagamentos S.A.\nExtrato Mensal\nConta: 123456\nPIX enviado para Banco Itaú\nTED enviada para Caixa";
    const res = inferIssuerBank("extrato.pdf", sample);
    expect(res).toBe("banco nubank");
  });

  test("Cenário 2: Identidade Inter", () => {
    const sample = "Banco Inter S.A.\nExtrato de Conta Corrente\nAgência 0001\nSaldo Anterior";
    const res = inferIssuerBank("extrato.pdf", sample);
    expect(res).toBe("banco inter");
  });

  test("Cenário 3: Identidade Bradesco", () => {
    const sample = "Banco Bradesco S.A.\nExtrato de Conta\nTitular: Joao da Silva\nTarifa Bancaria";
    const res = inferIssuerBank("extrato.pdf", sample);
    expect(res).toBe("banco bradesco");
  });

  test("Cenário 4: Precedência Institucional", () => {
    const sample = "Nu Pagamentos S.A.\nExtrato de Conta\nSaldo anterior";
    const res = inferIssuerBank("itau_extrato.pdf", sample);
    expect(res).toBe("banco nubank");
  });

  test("Cenário 5: Contraparte Repetida", () => {
    // Sem cabeçalho, com 3 transferências para o Itaú no corpo
    const sample = "Extrato de Conta\nTitular: Joao\nPIX enviado para Banco Itaú\nPIX recebido de Banco Itaú\nTED para Banco Itaú";
    const res = inferIssuerBank("extrato.pdf", sample);
    expect(res).toBeNull();
  });

  test("Cenário 6: Ocorrência Isolada", () => {
    const sample = "Extrato de Conta\nTitular: Joao\nPIX enviado para Caixa";
    const res = inferIssuerBank("extrato.pdf", sample);
    expect(res).toBeNull();
  });

  test("Cenário 7: Normalização de Banco do Brasil", () => {
    expect(normalizeIssuerBankName("Banco do Brasil")).toBe("banco do brasil");
    expect(normalizeIssuerBankName("Banco do Brasil S.A.")).toBe("banco do brasil");
    expect(normalizeIssuerBankName("BANCO DO BRASIL")).toBe("banco do brasil");
    expect(normalizeIssuerBankName("BB")).toBe("banco do brasil");
  });

  test("Cenário 8: Normalização Reconhecida", () => {
    expect(normalizeIssuerBankName("ITAÚ")).toBe("banco itaú");
    expect(normalizeIssuerBankName("Itaú")).toBe("banco itaú");
    expect(normalizeIssuerBankName("itau")).toBe("banco itaú");
    expect(normalizeIssuerBankName("banco itaú")).toBe("banco itaú");
    expect(normalizeIssuerBankName("Banco Itaú")).toBe("banco itaú");
    expect(normalizeIssuerBankName("Itaú Unibanco S.A.")).toBe("banco itaú");
  });

  test("Cenário 9: Normalização Desconhecida", () => {
    expect(normalizeIssuerBankName("instituição desconhecida")).toBeNull();
    expect(normalizeIssuerBankName("banco emissor")).toBeNull();
    expect(normalizeIssuerBankName("banco importado")).toBeNull();
  });

  test("Cenário 10: Ausência de Duplicação", () => {
    expect(normalizeIssuerBankName("banco nubank")).toBe("banco nubank");
  });

  test("Cenário 11: Reconhecimento de Nome de Arquivo", () => {
    expect(inferIssuerBank("NU_extrato.pdf", "")).toBe("banco nubank");
    expect(inferIssuerBank("NUBANK-extrato.pdf", "")).toBe("banco nubank");
    expect(inferIssuerBank("extrato_nubank.pdf", "")).toBe("banco nubank");
    expect(inferIssuerBank("INTER_2026.pdf", "")).toBe("banco inter");
    expect(inferIssuerBank("extrato-inter-2026.pdf", "")).toBe("banco inter");
    expect(inferIssuerBank("BRADESCO 07-2026.pdf", "")).toBe("banco bradesco");
    expect(inferIssuerBank("ITAU_EXTRATO.pdf", "")).toBe("banco itaú");
    expect(inferIssuerBank("ITAÚ-EXTRATO.pdf", "")).toBe("banco itaú");
    expect(inferIssuerBank("CAIXA_EXTRATO.pdf", "")).toBe("banco caixa");
    expect(inferIssuerBank("BB_EXTRATO.pdf", "")).toBe("banco do brasil");
    expect(inferIssuerBank("SANTANDER_EXTRATO.pdf", "")).toBe("banco santander");
    expect(inferIssuerBank("SICREDI_EXTRATO.pdf", "")).toBe("banco sicredi");
    expect(inferIssuerBank("SICOOB_EXTRATO.pdf", "")).toBe("banco sicoob");
    
    // Falsos positivos protegidos
    expect(inferIssuerBank("extrato_anual_bb.pdf", "")).toBeNull();
    expect(inferIssuerBank("BB.pdf", "")).toBe("banco do brasil");
  });

  test("Cenário 12: Teste da Operação Sistêmica RDB", () => {
    const rowSys: CanonicalRow = {
      description: "Resgate RDB",
      client_name: null,
      amount: 100,
      transaction_date: "2026-06-02"
    } as any;
    const validated = validateCanonicalConsistency(rowSys, "SYSTEM_RDB_REDEMPTION", "banco nubank");
    expect(validated.client_name).toBe("banco nubank");
  });

  test("Cenário 13: Teste do Fallback do Consumidor", () => {
    // 1. Operação sistêmica sem banco identificado deve receber "banco emissor"
    const rowSys: CanonicalRow = {
      description: "Resgate RDB",
      client_name: null,
      amount: 100,
      transaction_date: "2026-06-02"
    } as any;
    const validatedSys = validateCanonicalConsistency(rowSys, "SYSTEM_RDB_REDEMPTION", null);
    expect(validatedSys.client_name).toBe("banco emissor");

    // 2. Linha comum sem banco identificado deve permanecer null
    const rowCommon: CanonicalRow = {
      description: "Transferência recebida pelo Pix",
      client_name: null,
      amount: 100,
      transaction_date: "2026-06-02"
    } as any;
    const validatedCommon = validateCanonicalConsistency(rowCommon, "TRANSFER_RECEIVED", null);
    expect(validatedCommon.client_name).toBeNull();
  });
  
  test("Cenário 14: Sicredi e Sicoob Institucionais", () => {
    // Apenas "sicredi" sem contexto deve ser null
    expect(inferIssuerBank("extrato.pdf", "sicredi")).toBeNull();
    // Com contexto de agência/conta deve ser Sicredi
    expect(inferIssuerBank("extrato.pdf", "sicredi\nagencia: 1234\nconta: 5678")).toBe("banco sicredi");
    
    // Apenas "sicoob" sem contexto deve ser null
    expect(inferIssuerBank("extrato.pdf", "sicoob")).toBeNull();
    // Com contexto deve ser Sicoob
    expect(inferIssuerBank("extrato.pdf", "sicoob\ntitular: fulano\ncooperativa: 12")).toBe("banco sicoob");
  });
});
