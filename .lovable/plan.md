# Clientes para Retorno — CRM de Recuperação

Transforma o módulo de Retornos atual num CRM completo de recuperação de clientes, com scoring, priorização, oportunidades, tarefas, segmentação VIP e receita recuperada. Também corrige uma falha crítica de segurança descoberta pelo scanner (escalonamento de privilégios via `profiles.company_id`).

## 1. Correções de segurança (migration — primeiro)

Crítico — bloqueia o ataque antes de adicionar novas superfícies:

- **`profiles.company_id` deixa de ser editável pelo usuário.** Nova policy de UPDATE em `profiles` restringe colunas a `full_name`, `avatar_url`, `phone` (via trigger `BEFORE UPDATE` que reverte mudanças em `company_id`/`role`/`id`). INSERT continua via trigger `handle_new_user` apenas; remove policy permissiva atual de INSERT.
- **`user_roles`**: adiciona policies explícitas de INSERT/UPDATE/DELETE restritas a OWNER da mesma empresa (`has_role(auth.uid(), company_id, 'OWNER')`). SELECT continua escopo company.
- **`notifications`**: adiciona policy de DELETE (`user_id = auth.uid()`).
- Linter "RLS always true" / "SECURITY DEFINER executable": auditar e revogar EXECUTE de funções definer não-chamáveis pelo cliente; manter apenas `has_role`, `has_any_role`, `get_user_company`, `refresh_return_opportunities`.

## 2. Schema novo

```sql
-- Oportunidades de recuperação (separado de return_opportunities que continua sendo o "próximo retorno automático")
recovery_opportunities(
  id, company_id, client_id, service_id,
  potential_value numeric,
  score int,            -- 0-100
  status text,          -- OPEN | IN_CONTACT | CONVERTED | LOST
  assigned_to uuid,
  recovered_value numeric,
  converted_at timestamptz,
  appointment_id uuid,  -- preenchido na conversão
  created_at, updated_at
)

-- Tarefas
recovery_tasks(
  id, company_id, client_id, opportunity_id,
  description text, due_date date,
  assigned_to uuid, status text, -- OPEN | DONE | CANCELED
  created_at, updated_at
)
```

Ambas com RLS por `company_id`, GRANT para `authenticated` + `service_role`, triggers de `updated_at`.

**Funções/triggers:**
- `calc_recovery_score(client_id)` → 0-100 baseado em recência (40%), frequência (25%), valor (20%), nº visitas (15%).
- `classify_return_status(expected_date, last_visit)` → `ON_TIME | ATTENTION | LATE | AT_RISK | LOST`.
- View `recovery_dashboard` por company: total clientes, em risco, perdidos, receita potencial, receita recuperada no mês, taxa de conversão, ticket médio recuperado, tempo médio para retorno.
- View `vip_clients` (top 20% por `total_spent` por empresa).
- View `birthday_clients` (mês corrente).
- Trigger em `appointments` para conversão: quando `COMPLETED` e existe `recovery_opportunities` OPEN/IN_CONTACT → status=CONVERTED, recovered_value=price, appointment_id=NEW.id.
- Função `refresh_recovery_opportunities()`: cria/atualiza oportunidades a partir de `return_opportunities` ainda não convertidos. Roda no `pg_cron` diário.

## 3. Frontend

Renomeia item de menu para **"Clientes para Retorno"** (rota mantém `/app/returns` para evitar quebrar links; refatora componente).

### Página principal (`app.returns.tsx`)
- 5 KPI cards: Clientes para Retorno · Receita Potencial · Em Risco · Perdidos · Taxa de Recuperação.
- Filtros: Todos · Hoje · Esta Semana · Em Risco · Perdidos · VIP.
- Busca por nome/telefone/serviço.
- Lista priorizada (receita × score × dias atraso) com badge de classificação colorido, score visual (anel), selo VIP.
- Card destacado: **Receita Recuperada no Mês** + microcopy gamificado ("Você recuperou 12 clientes este mês").
- Mobile: ações fixas WhatsApp · Agendar · Registrar contato.

### Detalhe do cliente (sheet)
- Informações, KPIs financeiros, linha do tempo (reaproveita componentes de `app.clients.$clientId.tsx`).
- Histórico de contatos (`client_contacts` já existe).
- Botão WhatsApp com template configurável.
- Modal "Registrar contato" (canal + resultado + observação).
- Modal "Agendar Agora" — atalho para criar appointment sem sair.

### Dashboard de recuperação (`app.recovery.tsx` ou tab dentro de Returns)
- Clientes recuperados · Receita recuperada · Taxa conversão · Tempo médio para retorno.
- Lista de aniversariantes do mês.
- Lista de tarefas abertas.

### Atualização do dashboard principal
- Substituir card "Returns" por "Receita Recuperada (mês)" com link.

## 4. Detalhes técnicos

- TanStack Query em todas as listas; `staleTime: 30s`; invalidação após mutações.
- Paginação cursor-based (50 por página) na lista principal.
- Ordenação server-side via SQL com expressão `(potential_value * score / 100) + (days_late * 10)`.
- Score recalculado on-demand via RPC ao abrir o detalhe; armazenado denormalizado em `recovery_opportunities.score` (refresh diário).
- Mensagem WhatsApp template em `companies.whatsapp_template` (nova coluna, fallback hardcoded).

## 5. Fora de escopo (preparar mas não enviar)

- Automações 01-04: estrutura de tabela `recovery_automations` criada e leitura pelo cron, mas sem disparar mensagens (sem provider WhatsApp configurado ainda).
- Campanhas de aniversariantes.

## Ordem de execução

1. Migration de segurança + novas tabelas/views/triggers (uma migration única).
2. Tipos Supabase regenerados.
3. Refactor `app.returns.tsx` → "Clientes para Retorno".
4. Componentes detalhe + modais.
5. Página dashboard recuperação.
6. Ajuste menu lateral + dashboard principal.