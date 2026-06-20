## BeautyFlow v2 — Roadmap de execução

Escopo aprovado é grande demais para uma única entrega com qualidade. Vou dividir em **6 fases independentes**, cada uma entregue como um turno separado. Você aprova esta divisão e eu começo pela Fase 1 imediatamente.

### Fase 1 — Verticais + Onboarding (esta entrega)

- Migration: `companies.vertical` enum (`BEAUTY|SALES|GYM`), `companies.onboarding_completed`, campo `kind` em services (SERVICE/PRODUCT/PLAN), tabela `professionals`, normalização de telefone (+55).
- Wizard de onboarding em 6 passos (rota `/onboarding`): empresa → vertical → ofertas → profissionais → WhatsApp → finalizar. Bloqueia acesso ao app até completar.
- Helper `formatPhoneBR()` e validação client+server.

### Fase 2 — Motor de Recorrência + Dashboard "ação agora"

- Migration: view `v_actions_today` consolidando Retorno/Recompra/Renovação/Risco/Perdidos por vertical.
- Dashboard novo: cards Receita Recuperável / Ações Hoje / Em Risco / Agenda + bloco "Ações Prioritárias" com botões WhatsApp por linha + bloco "Oportunidades".
- Rota `/app/recorrencia` com abas: Retorno, Recompra, Renovações, Em Risco, Perdidos. Seleção múltipla + envio em massa via wa.me.

### Fase 3 — Agendamento Online público

- Rota pública `/agendar/$companySlug` (sem auth, SSR-friendly).
- Migration: `companies.slug`, `appointments.source` (ADMIN/ONLINE), server fn pública para slots disponíveis.
- Fluxo: serviço → profissional → horário → dados do cliente → confirma. Cria appointment + cliente automaticamente.

### Fase 4 — Smart Import com IA (Lovable AI)

- Migration: tabelas `import_jobs`, `import_rows`.
- Upload de PDF/CSV/XLSX → server fn extrai texto → `gemini-2.5-flash` identifica cliente/valor/serviço/data com schema Zod → tela de validação linha-a-linha → confirmação cria appointments + clients.

### Fase 5 — Communication Engine

- Tabelas `message_templates`, `campaigns`, `automations` (estrutura, sem execução automática).
- Tela de templates com variáveis `{{nome}}` `{{servico}}`.
- Campanhas: segmento → template → preview → "Abrir conversas" (gera lista de wa.me links).

### Fase 6 — Painel SaaS Admin completo

- Role `super_admin` (separada de owner).
- Rota `/admin/*` com guard.
- Telas: Empresas, Assinaturas, MRR/Churn, Health Score (0-100 calculado de uso/pagamento/recência), Logs de auditoria.

### Detalhes técnicos

- Stack mantida: TanStack Start + Supabase + RLS por `company_id`.
- WhatsApp = `wa.me` deep link com `encodeURIComponent` (zero custo).
- Smart Import usa Lovable AI Gateway (`google/gemini-2.5-flash`) via `createServerFn` + Zod `Output.object`.
- Todas as migrations seguem padrão GRANT + RLS + has_role.
- Cada fase incluirá ajuste em `src/integrations/supabase/types.ts` quando necessário.

### Confirmação

Posso seguir com a **Fase 1 (Verticais + Onboarding)** agora? Ou prefere reordenar / cortar alguma fase?
