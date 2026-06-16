
-- ============ FINANCIAL TRANSACTIONS ============
CREATE TYPE public.transaction_type AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tx_select_own_company" ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "tx_insert_own_company" ON public.financial_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  );

CREATE POLICY "tx_update_own_company" ON public.financial_transactions
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company(auth.uid())
         AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin'));

CREATE POLICY "tx_delete_owner" ON public.financial_transactions
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company(auth.uid())
         AND public.has_role(auth.uid(), company_id, 'owner'));

CREATE INDEX idx_tx_company_date ON public.financial_transactions(company_id, transaction_date DESC);
CREATE INDEX idx_tx_company_type ON public.financial_transactions(company_id, type);

CREATE TRIGGER trg_tx_updated_at BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFO',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid())
         AND (user_id IS NULL OR user_id = auth.uid()));

CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company(auth.uid())
         AND (user_id IS NULL OR user_id = auth.uid()));

CREATE POLICY "notif_insert_own_company" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE INDEX idx_notif_company_user ON public.notifications(company_id, user_id, read);

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid())
         AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin'));

CREATE POLICY "audit_insert_own" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid())
              AND user_id = auth.uid());

CREATE INDEX idx_audit_company_date ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_entity ON public.audit_logs(company_id, entity, entity_id);

-- ============ AUTO-CREATE INCOME ON COMPLETED APPOINTMENT ============
CREATE OR REPLACE FUNCTION public.handle_appointment_income()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') AND COALESCE(NEW.price, 0) > 0 THEN
    INSERT INTO public.financial_transactions (
      company_id, type, category, description, amount, transaction_date, appointment_id
    ) VALUES (
      NEW.company_id, 'INCOME', 'Atendimento',
      'Atendimento concluído', NEW.price, NEW.start_datetime::date, NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_completed_returns
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_appointment_completed();

CREATE TRIGGER trg_appointment_completed_income
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_appointment_income();

-- ============ VIEWS ============
CREATE OR REPLACE VIEW public.dashboard_metrics
WITH (security_invoker = true)
AS
SELECT
  c.id AS company_id,
  COALESCE(SUM(CASE WHEN ft.type = 'INCOME' THEN ft.amount ELSE 0 END), 0) AS total_income,
  COALESCE(SUM(CASE WHEN ft.type = 'EXPENSE' THEN ft.amount ELSE 0 END), 0) AS total_expense,
  COALESCE(SUM(CASE WHEN ft.type = 'INCOME' THEN ft.amount ELSE -ft.amount END), 0) AS profit,
  COALESCE(SUM(CASE WHEN ft.type = 'INCOME' AND ft.transaction_date >= date_trunc('month', CURRENT_DATE) THEN ft.amount ELSE 0 END), 0) AS income_month,
  COALESCE(SUM(CASE WHEN ft.type = 'EXPENSE' AND ft.transaction_date >= date_trunc('month', CURRENT_DATE) THEN ft.amount ELSE 0 END), 0) AS expense_month
FROM public.companies c
LEFT JOIN public.financial_transactions ft ON ft.company_id = c.id
GROUP BY c.id;

GRANT SELECT ON public.dashboard_metrics TO authenticated;

CREATE OR REPLACE VIEW public.retention_report
WITH (security_invoker = true)
AS
SELECT
  c.id AS company_id,
  COUNT(*) FILTER (WHERE ro.converted = false AND ro.status IN ('DUE','LATE')) AS pending_returns,
  COUNT(*) FILTER (WHERE ro.converted = true) AS converted_returns,
  COUNT(*) FILTER (WHERE ro.status = 'LOST') AS lost_returns,
  COALESCE(SUM(CASE WHEN ro.converted = false AND ro.status IN ('DUE','LATE') THEN ro.estimated_value ELSE 0 END), 0) AS potential_revenue,
  CASE WHEN COUNT(*) = 0 THEN 0
       ELSE ROUND((COUNT(*) FILTER (WHERE ro.converted = true))::numeric * 100 / COUNT(*), 2)
  END AS conversion_rate
FROM public.companies c
LEFT JOIN public.return_opportunities ro ON ro.company_id = c.id
GROUP BY c.id;

GRANT SELECT ON public.retention_report TO authenticated;

-- ============ DAILY CRON ============
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'beautyflow-daily-refresh',
  '0 3 * * *',
  $$ SELECT public.refresh_return_opportunities(); $$
);
