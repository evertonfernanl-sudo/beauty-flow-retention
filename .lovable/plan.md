# SIE V3 — Ajustes conforme Especificação Final Consolidada

A tela `/app/import` e o pipeline V3 já existem, mas a spec introduz **regras determinísticas rígidas** que não estão implementadas. Este plano aplica todas as correções, preservando o que já funciona.

## Escopo (o que muda)

### 1. Camada 2 — Conversão (fidelidade absoluta)

- **CSV/XLS — charset determinístico:** tentar UTF-8 → ISO-8859-1 → Windows-1252 nessa ordem fixa; persistir o charset usado; substituir indecifráveis por `�` + WARNING.
- **OFX:** adicionar parser (hoje só CSV/XLSX/PDF).
- **PDF multi-página:** reconstruir tabela por página, reidentificar cabeçalho por página, empilhar preservando ordem.
- **OCR (PDF imagem):** integrar detecção estrutural (coordenadas X/Y); calcular métrica de confiança (células extraídas / células estimadas); se <80% → `OCR_REVIEW` e interrompe.

### 2. Detecção de cabeçalho (Cap. 24.3)

- Descartar linhas iniciais vazias ou contendo apenas "Extrato/Banco/Agência/Conta/números/datas isoladas".
- Primeira linha com ≥2 cabeçalhos conhecidos = header oficial (removida do dataset).
- Se nenhuma linha atender → `HEADER_FAILED` → `FAILED`.

### 3. Merge de linhas quebradas (Cap. 24.7)

- Linha sem `occurred_at` válido nem coluna estrutural → concatenar em `description` da linha anterior.

### 4. Camada 3 — Mapeamento

- Expandir dicionário conforme Cap. 9 (Favorecido, Beneficiário, Histórico/Complemento, Débito, Crédito, D/C, etc.).
- **Ambiguidade:** coluna mais à esquerda vence, com `reason` "Coluna mais à esquerda prevaleceu".
- **Histórico + Complemento:** concatenar com `" - "` na ordem original.

### 5. Camada 4 — Modelo Canônico

- Adicionar campos: `document_number`, `cpf_cnpj`, `debit_amount`, `credit_amount`, `movement_type`.
- **Derivação de `amount`:** se `débito`/`crédito` preenchidos → `abs()` do que estiver; Crédito prevalece com WARNING se ambos.
- **Parser de valores determinístico:** grammar parser (1v+1p → BR; 2p → US; 1v → BR); falha → `LINE_FAILED`.
- **Datas:** DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD; OFX/timestamp → converter para `America/Sao_Paulo`, extrair só data; timezone ausente → UTC-3 + WARNING; falha → `LINE_FAILED`.
- **Snapshot original:** JSON dos valores brutos por linha (antes de trim/conversão).
- **Hash SHA-256** do arquivo original completo (não por linha).

### 6. Extração de cliente da descrição (Cap. 10)

- Extratores parametrizados por banco (BB, Caixa, Nubank, Itaú, Bradesco, Santander) usando regex com palavras-chave ("PARA", "A FAVOR DE", "BENEFICIÁRIO", "DE", "DESTINO:").
- Fallback: sequência de tokens maiúsculos/acentuados, descartando termos bancários.
- Nunca inventar; não encontrado → `NULL`.

### 7. Camada 5 — Resolução (só metadados)

- **Classificação com tabela de pesos oficial** (Cap. 11.3): Crédito=+40, Débito=+40, keyword forte=+30, sinal=+20, D/C=+10. Limiar <60 → `LINE_REVIEW`.
- **Direção estrutural** (Cap. 11.2) precede subclassificação Receita/Aporte/Despesa Empresa/Despesa Pessoal.
- **Deduplicação objetiva:** mesmo `amount` (±0.01) + `client_name` normalizado igual (ou ambos vazios) + `|Δoccurred_at| ≤ 1 dia`, dentro da importação ou últimos 30 dias → `possible_duplicate=true` + IDs conflitantes na auditoria.
- Resolução de cliente: CPF → telefone → documento → nome exato → similaridade.

### 8. Camada 6 — Assertion Guard

- Comparar canonical × snapshot para campos protegidos (Cliente, Descrição, Valor, Data, Documento, CPF/CNPJ, Saldo, Telefone); restaurar automaticamente + auditar; se restauração falhar → `LINE_FAILED`.

### 9. Máquina de Estados de Falhas (Cap. 37) — regra mestra

Estados por linha: `OK | LINE_FAILED | LINE_REVIEW | HEADER_FAILED | OCR_REVIEW`.
Estado global final decidido **após** processar tudo, na ordem fixa:

1. `HEADER_FAILED` → **FAILED** (interrompe)
2. `OCR_REVIEW` → **REVIEW** (interrompe)
3. `LINE_FAILED/total ≥ 10%` → **FAILED**
4. `LINE_REVIEW > 0` → **REVIEW**
5. `LINE_FAILED > 0` (<10%) → **PARTIAL_SUCCESS**
6. senão → **SUCCESS**

Falhas de linha nunca interrompem o pipeline (só HEADER/OCR interrompem).

### 10. Auditoria

- Campo `responsavel` obrigatório: `'Sistema' | 'Usuário' | 'Algoritmo v3.0.0'`.
- Toda decisão automática com `reason` obrigatório.
- Append-only (já garantido por policy — reforçar).

### 11. UI `/app/import`

- Ordem original das linhas preservada; reordenar colunas é permitido (cosmético).
- Colunas originais (readonly) separadas das colunas de sugestão.
- Badges de status por linha (`OK/REVIEW/FAILED`) e estado global da importação.
- Drawer de auditoria já existe — adicionar snapshot bruto + hash SHA-256 + charset.
- **Nunca interromper** durante importação; toda ação humana é pós-processamento.

## Alterações técnicas

### Banco (migração)

- `v3_imports`: adicionar `file_hash text`, `charset text`, `final_state text CHECK (final_state IN ('SUCCESS','PARTIAL_SUCCESS','REVIEW','FAILED'))`, `total_rows int`, `failed_rows int`, `review_rows int`, `ocr_confidence numeric`.
- `v3_import_rows`: substituir `status` por enum `('OK','LINE_FAILED','LINE_REVIEW')`, adicionar `possible_duplicate boolean`, `duplicate_of uuid[]`, `classification_confidence int`, `reason text`.
- `v3_audit_log`: adicionar `responsavel text NOT NULL`, `algorithm_version text`.

### Código

- `src/lib/api/v3/pipeline.server.ts` — refatorar completamente:
  - `parseCsv`/`parseXlsx` → charset determinístico.
  - `parseOfx` (novo).
  - `parsePdf` → detecção estrutural + multi-página + merge de linhas quebradas + confiança.
  - `detectHeader` (novo, com descarte).
  - `mapHeaders` → prioridade "coluna mais à esquerda" + concatenação Histórico+Complemento.
  - `buildCanonical` → parser determinístico + datas + derivação de amount + snapshot bruto.
  - `extractClientFromDescription` (novo, com extratores por banco).
  - `resolveRow` → tabela de pesos + confiança + dedup objetivo.
  - `assertionGuard` (novo).
  - `computeFinalState` (novo — máquina de estados).
- `src/lib/api/siev3.functions.ts` — expor `final_state`, `stats`.
- `src/routes/_authenticated/app.import.tsx` — badges de estado, colunas originais vs sugestões separadas, aviso de duplicidade.

## O que fica de fora deste ciclo

- Interface para editar mapeamento por banco (extratores ficam hard-coded para BB/Caixa/Nubank/Itaú/Bradesco/Santander).
- Integração da tela V3 no lugar da V2 (mantém coexistência).

## Confirmações

1. Posso substituir integralmente o pipeline atual (mantendo a assinatura pública das server functions), certo?
2. OFX é prioridade agora ou pode ficar para o próximo ciclo? (parser OFX adiciona ~1 arquivo)
3. OCR estrutural real (com coordenadas) exige biblioteca extra (`pdfjs-dist` com layout ou serviço externo). Confirma que posso incluir `pdfjs-dist` para extração posicional?
