export const IGNORED_ROW_PATTERNS = {
  Institutional: [
    /cnpj\s*:\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/i,
    /ag[eê]ncia\s*:\s*\d+/i,
    /conta\s*:\s*\d+/i,
    /banco\s*:\s*[a-zA-Z]+/i,
    /titular\s*:/i,
    /periodo\s*:/i,
    /extrato\s*de\s*conta/i
  ],
  Resumo: [
    /^resumo$/i,
    /^resumo\s+do\s+periodo$/i,
    /^resumo\s+do\s+mes$/i,
    /^demonstrativo/i
  ],
  Saldo: [
    /^saldo\s+anterior$/i,
    /^saldo\s+inicial$/i,
    /^saldo\s+final$/i,
    /^saldo\s+atual$/i,
    /^saldo\s+disponivel$/i
  ],
  Rodape: [
    /pagina\s+\d+\s+de\s+\d+/i,
    /folha\s+\d+/i,
    /tem\s+alguma\s+duvida/i,
    /atendimento\s+24h/i,
    /ouvidoria/i,
    /nubank\.com\.br/i
  ],
  Metadados: [
    /extrato\s+gerado\s+dia/i,
    /valores\s+em\s+r\$/i
  ]
};

// isIgnoredRow - usado durante a detecção do cabeçalho (todas as células precisam ser ruído)
export function isIgnoredRow(cells: string[]): boolean {
  if (cells.length === 0) return true;
  
  const isFiller = cells.every(cell => {
    const norm = cell.trim().toLowerCase();
    if (!norm) return true;
    
    for (const category of Object.values(IGNORED_ROW_PATTERNS)) {
      if (category.some(pattern => pattern.test(cell))) {
        return true;
      }
    }
    return false;
  });
  
  return isFiller;
}

// isSummaryOrBalanceRow - usado para filtrar linhas de saldo/resumo no corpo (qualquer célula combinada com saldo/resumo)
export function isSummaryOrBalanceRow(cells: string[]): boolean {
  return cells.some(cell => {
    const norm = cell.trim().toLowerCase();
    if (!norm) return false;
    
    // Filtra apenas contra Saldo, Resumo e Rodapé institucional
    for (const category of [IGNORED_ROW_PATTERNS.Saldo, IGNORED_ROW_PATTERNS.Resumo, IGNORED_ROW_PATTERNS.Rodape]) {
      if (category.some(pattern => pattern.test(cell))) {
        return true;
      }
    }
    
    // Padrão adicional flexível para capturar saldo concatenado (ex: "saldo em conta", "saldo anterior")
    const hasBalancePattern = /\b(saldo|saldo anterior|saldo atual|saldo do dia|saldo dia|saldo disponível|saldo em conta|saldos diários|saldo final|saldo c\/c|saldo c\/a|saldo c\.a|saldo d\/c|saldo de transações|resumo do dia|total de débitos|total de créditos|total de saídas|total de entradas|saldo consolidado|limite contratado|limite cheque especial|resumo do período|resumo do periodo|saldo após operação|saldo apos operacao|saldo após transação|saldo apos transacao)\b/i.test(cell);
    if (hasBalancePattern) return true;
    
    return false;
  });
}
