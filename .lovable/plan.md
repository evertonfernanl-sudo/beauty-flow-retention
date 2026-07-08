# Implementação da NTIEB v1.0 na SIE V3

A norma foi salva em `docs/ntieb-v1.md` como referência oficial. O pipeline V3 atual já cobre boa parte dos capítulos 1–10 (princípios), 15–17 (operações, descrição, cliente), 23–32 (subclassificação), 33–34 (matriz), parte de 60 (dedup) e 62 (auditoria). O plano abaixo fecha os gaps sem quebrar o que funciona, em 4 fases entregáveis independentes.

## Mapa: onde estamos vs. NTIEB

| NTIEB | Já existe | Gap |
|---|---|---|
| Cap. 5 — Hierarquia de decisões | Parcial em `classify` | Ordem canônica não é auditável linha a linha |
| Cap. 7, 13, 16.4 — Blocos multi-linha / continuidade entre páginas | Merge simples em `pipeline.server.ts` | Sem reconstrução por bloco em PDF nativo/OCR |
| Cap. 14 — Contexto temporal herdado | Não | Data anterior não é propagada quando linha sem data |
| Cap. 15 — Operações neutras (Saldo Inicial/Final, Total) | Parcial (`isSummaryOrBalanceRow`) | Não gera lançamento mas também não alimenta cap. 55 |
| Cap. 34 — Matriz oficial | Coberto por Pattern Library | Falta tabela declarativa espelhando cap. 34 exato |
| Cap. 36, 61 — Confidence score em 5 níveis | `classification_confidence` numérico | Sem mapeamento p/ Muito Alta/Alta/Média/Baixa/Muito Baixa |
| Cap. 55 — Validação de saldo (SI + R − D = SF) | Não | Requer capturar Saldo Inicial/Final do extrato |
| Cap. 56–59 — Validações pós-parse (valor, data, cliente, descrição) | Parcial | Sem checagens explícitas rotuladas por regra |
| Cap. 60 — Duplicidade objetiva | Existe (`possible_duplicate`) | Ok |
| Cap. 62 — Rastreabilidade (regra aplicada por campo) | `reason` livre | Sem citar `regra_aplicada` (ex.: "17.3", "33.1") |
| Cap. 64 — Homologação (4 status) | `final_state` com 4 valores | Renomear/mapear para os 4 status oficiais |
| Cap. 65 — Log obrigatório | Parcial (`v3_imports`) | Faltam: versão NTIEB, tempo, contagem R/D |

## Fases

### Fase 1 — Rastreabilidade e Matriz Oficial (baixo risco, alto valor)

Objetivo: tornar toda decisão auditável citando a regra da NTIEB, sem mudar comportamento.

1. Criar `src/lib/api/v3/ntieb/rules.ts` com:
   - `OFFICIAL_MATRIX` (cap. 34) — mapa operação → natureza, fonte única da verdade.
   - `CONFIDENCE_LEVELS` (cap. 36/61) — enum `MUITO_ALTA | ALTA | MEDIA | BAIXA | MUITO_BAIXA` + função `toLevel(score)`.
   - `HOMOLOGATION_STATUS` (cap. 64) — `APROVADA | APROVADA_COM_ALERTAS | PENDENTE | REJEITADA` + mapeamento a partir do `final_state` atual.
2. Em `pipeline.server.ts` `classify`/`resolveRow`: além de `reason`, gravar `rule_applied` (ex.: `"NTIEB 33.1"`, `"NTIEB 17.3"`, `"NTIEB 24.PIX"`).
3. Migração: adicionar em `v3_import_rows`: `rule_applied text`, `confidence_level text`; em `v3_imports`: `homologation_status text`, `ntieb_version text default '1.0'`, `parser_version text`, `processing_ms int`, `income_count int`, `expense_count int`.
4. UI `app.import.tsx`: mostrar badge de `homologation_status` no topo e `confidence_level` por linha (substitui/complementa o numérico).

### Fase 2 — Contexto Temporal e Blocos Multi-linha (cap. 7, 13, 14, 16.4)

Objetivo: extratos onde uma linha física ≠ um lançamento passam a ser interpretados corretamente.

1. Novo módulo `src/lib/api/v3/blocks/blockAssembler.ts`:
   - Entrada: linhas brutas ordenadas + índice do header.
   - Saída: array de "blocos" (grupos de linhas físicas que formam 1 lançamento).
   - Regras: nova data / nova descrição de operação (cap. 15) / novo valor após bloco fechado abrem bloco; mudança de página nunca fecha.
2. Contexto temporal herdado (cap. 14): parser mantém `lastDate`; linha sem data válida herda a última.
3. Concatenação de descrição multi-linha (cap. 16.4) dentro do bloco.
4. Integrar assembler no fluxo CSV/XLSX/PDF (PDF nativo é onde mais aparece). OFX/XLSX com 1 linha = 1 lançamento continuam funcionando (assembler no-op).
5. Testes: adicionar fixtures em `enrichment/tests/` cobrindo bloco de 6 linhas do exemplo cap. 13.

### Fase 3 — Validações Financeiras e Homologação (cap. 53–59, 63–64)

1. Capturar `saldo_inicial`, `saldo_final`, `total_entradas`, `total_saidas` das linhas neutras (cap. 15.3) para dentro de `v3_imports`.
2. Novo `src/lib/api/v3/validation/balanceValidator.ts`:
   - `SI + ΣReceitas − ΣDespesas ≈ SF` com tolerância R$ 0,01.
   - Divergência → `homologation_status = APROVADA_COM_ALERTAS` + inconsistência auditada; nunca corrige.
3. Validators pós-parse por linha: valor (cap. 56), data (cap. 57), cliente (cap. 58), descrição (cap. 59). Cada falha vira `LINE_REVIEW` com `rule_applied` citando o capítulo.
4. Regra dura (cap. 61): confidence `MUITO_BAIXA` → `LINE_REVIEW` obrigatório.
5. Mapeamento oficial de `final_state` → `homologation_status`:
   - `SUCCESS` → APROVADA; `PARTIAL_SUCCESS` c/ alertas → APROVADA_COM_ALERTAS; `REVIEW` → PENDENTE; `FAILED` → REJEITADA.

### Fase 4 — Refinos de robustez (cap. 12, 32, 43–52)

1. Limpeza determinística de ruído administrativo (cap. 12.3): rodapés, telefones, ouvidoria, CPF do titular do extrato.
2. Operações internas (cap. 32): garantir que `SYSTEM_*` sempre resulte em `client_name = banco emissor` — já parcial em `consistencyValidator`, formalizar contra a matriz.
3. Log de homologação completo (cap. 65) exposto na UI (drawer de auditoria).
4. Testes de regressão end-to-end com pelo menos 1 extrato por banco suportado (BB, Caixa, Nubank, Itaú, Bradesco, Santander).

## Detalhes técnicos

- Nenhuma quebra de contrato público — `siev3.functions.ts` mantém assinatura; novos campos são acréscimos.
- Todas as migrações seguem GRANT explícito por role, RLS já cobre `v3_*`.
- Sem novas dependências npm nas Fases 1–3; Fase 4 pode precisar refinar `pdfjs-dist` para coordenadas (opcional).
- `docs/ntieb-v1.md` fica como fonte de verdade; comentários no código referenciam capítulo/regra.

## O que fica fora deste ciclo

- Reprocessamento retroativo de imports antigos (a norma se aplica apenas a novas importações).
- OCR estrutural com coordenadas X/Y (cap. 43–46 mais avançados) — mantemos OCR atual, apenas marcamos `MUITO_BAIXA` quando confiança <80%.
- Editor visual de regras por banco.

## Perguntas antes de iniciar

1. Posso começar pela **Fase 1** agora (rastreabilidade + matriz + status de homologação), que é a de menor risco e destrava a auditoria pedida nos cap. 62–66?
2. As 4 fases devem ser entregues **em sequência num único ciclo**, ou prefere aprovar/revisar a cada fase?
3. Confirma que posso adicionar as colunas descritas em `v3_imports` e `v3_import_rows` (migração aditiva, sem quebrar dados existentes)?
