
## Objetivo

Criar a tela **Import** (`/app/import`) com a ferramenta **SIE V3**, totalmente independente da SIE V1/V2. A V2 (`/app/sie`) permanece intacta. A V3 segue a "constituição" de 20 regras + 10 refinamentos: determinismo, fidelidade ao arquivo, Modelo Canônico como fonte operacional, snapshot original como fonte de auditoria, separação radical entre dados e resolução, motivos registrados em toda decisão automática.

## Princípios fundadores (no topo da implementação)

1. **Determinismo (princípio nº 1)** — O mesmo arquivo importado produz exatamente o mesmo resultado em qualquer execução. Nenhuma etapa pode depender de relógio, ordem de jobs, IDs aleatórios ou estado externo mutável durante o processamento de uma linha.
2. **Fonte da verdade** — Toda decisão operacional do sistema lê do **Modelo Canônico**. O **Original Snapshot** é fonte exclusiva de auditoria e restauração. Nenhuma camada posterior pode reler campos modificados.
3. **Independência de formato** — PDF, CSV, XLSX e OFX convergem para o Modelo Canônico e, a partir daí, percorrem **exatamente o mesmo pipeline**. Proibido `if (source === 'pdf')` após a Camada 4.
4. **Independência de banco** — Novos bancos só podem ser suportados expandindo o módulo de **Mapeamento**. Nenhuma alteração permitida nas demais camadas.

## Arquitetura

```text
Arquivo (PDF/CSV/XLSX/OFX)
   ↓ Camada 1 — Entrada (upload → storage 'imports')
   ↓ Camada 2 — Conversão (qualquer formato → tabela bruta única)
   ↓ Camada 3 — Mapeamento (cabeçalhos → campos canônicos, com desambiguação)
   ↓ Camada 4 — Modelo Canônico (apenas conversões de formato; snapshot original gravado)
   ↓ Camada 5 — Resolução (clientes, serviços, categorias, INCOME/EXPENSE, dedup) → metadados
   ↓ Camada 6 — Validação (diff final vs snapshot; restaura campos protegidos)
   ↓ Camada 7 — Persistência (snapshot + canônico + sugestões + resultado aplicado)
   ↓ Camada 8 — Auditoria (decisões com motivo)
   ↓ Camada 9 — Exibição (tela Import)
```

A **Camada 5** foi renomeada de "Inteligência" para **Resolução**: ela resolve clientes, serviços, categorias, dedup e classificação INCOME/EXPENSE — não é só IA. **Jamais** altera, complementa, normaliza, corrige ou substitui campos protegidos; seu único produto são metadados.

O **parser PDF** (Camada 2) tem responsabilidade única: reconstruir a estrutura tabular do documento. **Proibido** qualquer regra específica de interpretação financeira no parser; toda interpretação ocorre nas camadas posteriores.

## Banco de dados (migration única)

Tabelas espelhadas dedicadas, GRANTs e RLS por `company_id`:

- `v3_imports` — id, company_id, source, filename, storage_path, status, last_error, created_by.
- `v3_import_rows`:
  - `row_index int NOT NULL` (ordem original preservada)
  - `original_snapshot jsonb NOT NULL` (fonte de auditoria/restauração — imutável)
  - `canonical jsonb NOT NULL` (Modelo Canônico — **fonte operacional**)
  - `suggestions jsonb` (saída da Resolução: client_id, service_id, scores)
  - `processing_metadata jsonb` (parser, banco identificado, confiança, tempo, versão do algoritmo, versão do prompt, OCR, engine — tudo que não é dado do usuário)
  - `applied_result jsonb` (estado final aplicado, quando aprovado)
  - `protected_fields text[]` default `ARRAY['client_name','description','amount','transaction_date','balance','document','cpf_cnpj','phone']`
  - `resolved_client_id`, `resolved_service_id` (metadados apenas)
- `v3_row_snapshots` (append-only) — `(id, row_id, stage, payload, decided_at, reason)`.
- `v3_audit_log` (append-only) — `(id, import_id, row_id, stage, event, input, output, reason NOT NULL, created_at)`. **`reason` obrigatório**: toda decisão automática deve registrar o motivo (ex.: "cliente sugerido por match exato de CPF", "classificado EXPENSE por coluna débito > 0").
- `v3_financial_transactions` — espelha `financial_transactions` + `v3_row_id` FK + `engine = 'v3'`.
- View `v3_row_audit` — junta linha + snapshots + audit_log.
- Trigger `v3_guard_protected_fields()` em `v3_import_rows`: em UPDATE, qualquer campo listado em `protected_fields` é restaurado a partir de `original_snapshot` e registra evento `PROTECTED_RESTORE` com motivo.
- Trigger de auditoria em INSERT/UPDATE/DELETE.

RLS: SELECT/INSERT/UPDATE/DELETE por membros da `company_id`; `service_role` total; sem `anon`.

## Backend

Módulos isolados em `src/lib/api/v3/*` (zero acoplamento com worker.server.ts / worker-v2.server.ts):

- `parser-csv.server.ts`, `parser-xlsx.server.ts`, `parser-pdf.server.ts` — convertem arquivo em tabela bruta. **Sem interpretação financeira.**
- `mapper.server.ts` — desambiguação de cabeçalhos por contexto. **Único módulo a evoluir quando adicionar novo banco.**
- `canonical.server.ts` — apenas conversões de formato (texto→número BR, texto→data, trim, encoding). Grava `original_snapshot` antes de qualquer transformação.
- `resolution.server.ts` — Camada 5: match cliente/serviço, classificação INCOME/EXPENSE (descrição + colunas crédito/débito + sinal + indicadores), dedup. Saída em `suggestions` + `reason` por decisão. Nunca toca canônico nem snapshot.
- `validator.server.ts` — diff final vs snapshot, restaura campos protegidos, registra restauração com motivo.
- `persistence.server.ts` — escreve simultaneamente snapshot + canônico + sugestões + applied_result; permite reconstrução integral.
- `audit.server.ts` — helper que **força `reason`** em toda gravação no `v3_audit_log`.
- `pipeline.server.ts` — orquestra Camadas 2→8 deterministicamente. Inputs idênticos → output idêntico.
- `siev3.functions.ts` — `registerImportV3`, `applyImportRowV3`, `applyImportBatchV3`, `getV3RowAudit`, `convertPdfToCsvV3`. Todas com `requireSupabaseAuth`.

PDF direto reusa o caminho do CSV: `parser-pdf` → tabela bruta → `mapper` → `canonical` → resto do pipeline.

## Frontend

- `src/routes/_authenticated/app.import.tsx` — substitui o redirect atual:
  - Upload unificado (PDF/CSV/XLSX/OFX) com auto-detecção.
  - Tabela na **ordem original** mostrando:
    - Colunas Originais (badge "Original", somente leitura).
    - Colunas Sugeridas (badge "Sugestão", editáveis; gravam em `suggestions`).
    - Cliente sugerido com `ClientPickerDialog` (apenas metadado).
    - Status + tooltip com o **motivo** da Resolução.
  - Filtros: tipo, status, confiança, intervalo de datas.
  - Ações: aplicar linha, aplicar lote, ver auditoria (drawer com `v3_row_audit`).
  - KPI cards (linhas totais, aplicadas, em revisão, falhas, receitas, despesas).
- `src/components/v3/V3RowAuditDrawer.tsx` — snapshots por etapa + decisões + motivos.

## Integração com telas existentes — via adaptador, não via UNION nas views

Conforme sua observação: **não acoplar a plataforma à V3**. Em vez de substituir as consultas das telas Agenda/Dashboard/Clientes/Recorrência por views `*_all`:

- A V3 grava lançamentos aprovados em `v3_financial_transactions`.
- Cria-se uma camada `src/lib/adapters/financial-source.ts` (server-only) que expõe leituras agregadas (ex.: `getFinancialTransactions(company_id, filtros)`) e internamente decide quais fontes consultar — hoje: `financial_transactions` (V2) + `v3_financial_transactions`. Telas chamam o adaptador.
- Telas Agenda/Dashboard/Clientes/Recorrência passam a consumir o adaptador onde fizer sentido (apenas leituras agregadas — escritas continuam diretas).
- Amanhã, V4/V5 ou outra origem entram no adaptador sem tocar nas telas.

## Roteamento e menu

- `src/routes/_authenticated/app.import.tsx` — passa a renderizar a tela V3 (remover o redirect para `/app/sie`).
- Sidebar ganha "Import (V3)" ao lado de "Importar Dados".

## Segurança

- Server fns com `requireSupabaseAuth`.
- Funções `SECURITY DEFINER` com `search_path = public` e EXECUTE apenas para `authenticated`.
- Trigger guardião + validator garantem que nada altera silenciosamente campos protegidos.

## Entregáveis

1. Migration: tabelas V3 + views de auditoria + triggers + GRANTs + RLS.
2. Backend: 9 módulos em `src/lib/api/v3/*` + `siev3.functions.ts`.
3. Frontend: `app.import.tsx` + drawer de auditoria + item de menu.
4. Adaptador `financial-source.ts` + ajuste pontual das telas para consumi-lo.

## Fora de escopo

- Tocar em V1/V2 (`worker.server.ts`, `worker-v2.server.ts`, `app.sie.tsx`, `app.siev2.tsx`).
- Migração de dados antigos para tabelas V3.
- Comparação de equivalência V2↔V3.

## Resumo das 10 melhorias incorporadas

1. Modelo Canônico declarado como **fonte operacional**, snapshot como **fonte de auditoria**.
2. Parser PDF restrito à reconstrução tabular; proibida interpretação financeira nele.
3. Regra de evolução: novos bancos só via Mapeamento.
4. Independência de formato: pipeline único após a Camada 4.
5. Resolução jamais altera/normaliza/substitui campos protegidos — só metadados.
6. Persistência simultânea: snapshot + canônico + sugestões + resultado aplicado.
7. `reason` obrigatório em toda decisão automática do `v3_audit_log`.
8. Coluna `processing_metadata` separada de `suggestions`.
9. Camada 5 renomeada de "Inteligência" para **Resolução**.
10. **Determinismo** como princípio nº 1.
11. (Bônus, da sua preocupação) Integração com telas existentes via **adaptador**, não por substituição das consultas.
