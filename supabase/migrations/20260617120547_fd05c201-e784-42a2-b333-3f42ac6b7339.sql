
-- =========================================
-- 1. SECURITY FIXES
-- =========================================

-- Block users from changing privileged columns on profiles
CREATE OR REPLACE FUNCTION public.guard_profile_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'profiles.company_id cannot be changed by the user';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'profiles.email cannot be changed here';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_profile_immutable_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_guard ON public.profiles;
CREATE TRIGGER trg_profiles_guard
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_immutable_fields();

-- user_roles: lock down INSERT/UPDATE/DELETE to OWNERs only
DROP POLICY IF EXISTS "user_roles_owner_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_owner_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_owner_delete" ON public.user_roles;

CREATE POLICY "user_roles_owner_insert" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  company_id = public.get_user_company(auth.uid())
  AND public.has_role(auth.uid(), company_id, 'owner'::app_role)
);

CREATE POLICY "user_roles_owner_update" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  company_id = public.get_user_company(auth.uid())
  AND public.has_role(auth.uid(), company_id, 'owner'::app_role)
)
WITH CHECK (
  company_id = public.get_user_company(auth.uid())
  AND public.has_role(auth.uid(), company_id, 'owner'::app_role)
);

CREATE POLICY "user_roles_owner_delete" ON public.user_roles
FOR DELETE TO authenticated
USING (
  company_id = public.get_user_company(auth.uid())
  AND public.has_role(auth.uid(), company_id, 'owner'::app_role)
);

-- notifications: allow user to delete own
DROP POLICY IF EXISTS "notif_delete_own" ON public.notifications;
CREATE POLICY "notif_delete_own" ON public.notifications
FOR DELETE TO authenticated
USING (
  company_id = public.get_user_company(auth.uid())
  AND (user_id IS NULL OR user_id = auth.uid())
);

-- Lock down SECURITY DEFINER helpers (only callable from inside policies/triggers)
REVOKE EXECUTE ON FUNCTION public.refresh_return_opportunities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_return_opportunities() TO authenticated;

-- =========================================
-- 2. RECOVERY OPPORTUNITIES
-- =========================================
DO $$ BEGIN
  CREATE TYPE public.recovery_status AS ENUM ('OPEN','IN_CONTACT','CONVERTED','LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.return_class AS ENUM ('ON_TIME','ATTENTION','LATE','AT_RISK','LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.recovery_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  expected_return_date date NOT NULL,
  potential_value numeric(12,2) NOT NULL DEFAULT 0,
  score int NOT NULL DEFAULT 50,
  classification public.return_class NOT NULL DEFAULT 'ON_TIME',
  days_late int NOT NULL DEFAULT 0,
  status public.recovery_status NOT NULL DEFAULT 'OPEN',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recovered_value numeric(12,2),
  converted_at timestamptz,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  last_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_id, expected_return_date)
);

CREATE INDEX IF NOT EXISTS idx_recovery_company_status ON public.recovery_opportunities(company_id, status);
CREATE INDEX IF NOT EXISTS idx_recovery_priority ON public.recovery_opportunities(company_id, ((potential_value * score / 100.0) + (days_late * 10)) DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_opportunities TO authenticated;
GRANT ALL ON public.recovery_opportunities TO service_role;
ALTER TABLE public.recovery_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recovery_select" ON public.recovery_opportunities
FOR SELECT TO authenticated USING (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "recovery_insert" ON public.recovery_opportunities
FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "recovery_update" ON public.recovery_opportunities
FOR UPDATE TO authenticated
USING (company_id = public.get_user_company(auth.uid()))
WITH CHECK (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "recovery_delete" ON public.recovery_opportunities
FOR DELETE TO authenticated
USING (
  company_id = public.get_user_company(auth.uid())
  AND public.has_any_role(auth.uid(), company_id, 'owner'::app_role, 'admin'::app_role)
);

DROP TRIGGER IF EXISTS trg_recovery_updated_at ON public.recovery_opportunities;
CREATE TRIGGER trg_recovery_updated_at
BEFORE UPDATE ON public.recovery_opportunities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 3. RECOVERY TASKS
-- =========================================
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('OPEN','DONE','CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.recovery_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.recovery_opportunities(id) ON DELETE CASCADE,
  description text NOT NULL,
  due_date date,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.task_status NOT NULL DEFAULT 'OPEN',
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_company_status ON public.recovery_tasks(company_id, status, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_tasks TO authenticated;
GRANT ALL ON public.recovery_tasks TO service_role;
ALTER TABLE public.recovery_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON public.recovery_tasks
FOR SELECT TO authenticated USING (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "tasks_insert" ON public.recovery_tasks
FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "tasks_update" ON public.recovery_tasks
FOR UPDATE TO authenticated
USING (company_id = public.get_user_company(auth.uid()))
WITH CHECK (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "tasks_delete" ON public.recovery_tasks
FOR DELETE TO authenticated USING (company_id = public.get_user_company(auth.uid()));

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.recovery_tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON public.recovery_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 4. WHATSAPP TEMPLATE on companies
-- =========================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS whatsapp_template text
  DEFAULT 'Olá {{nome}}! Percebemos que já faz algum tempo desde seu último atendimento. Gostaria de agendar um novo horário? Será um prazer atendê-la novamente. 💕';

-- =========================================
-- 5. SCORING & CLASSIFICATION
-- =========================================
CREATE OR REPLACE FUNCTION public.classify_return(_expected date, _last_visit timestamptz)
RETURNS public.return_class
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _last_visit IS NOT NULL AND (CURRENT_DATE - _last_visit::date) >= 90 THEN 'LOST'::public.return_class
    WHEN _last_visit IS NOT NULL AND (CURRENT_DATE - _last_visit::date) >= 30 AND CURRENT_DATE > _expected THEN 'AT_RISK'::public.return_class
    WHEN CURRENT_DATE > _expected THEN 'LATE'::public.return_class
    WHEN (_expected - CURRENT_DATE) <= 7 THEN 'ATTENTION'::public.return_class
    ELSE 'ON_TIME'::public.return_class
  END;
$$;

CREATE OR REPLACE FUNCTION public.calc_recovery_score(_client_id uuid)
RETURNS int
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz; v_count int; v_spent numeric;
  v_days int;
  v_recency int; v_freq int; v_value int; v_visits int;
BEGIN
  SELECT last_visit, appointments_count, total_spent
    INTO v_last, v_count, v_spent
  FROM public.clients WHERE id = _client_id;
  IF v_last IS NULL THEN v_days := 365; ELSE v_days := CURRENT_DATE - v_last::date; END IF;

  -- Recency (40): closer = higher
  v_recency := GREATEST(0, 40 - (v_days::int * 40 / 90));
  -- Frequency (25)
  v_freq    := LEAST(25, COALESCE(v_count,0) * 5);
  -- Value (20)
  v_value   := LEAST(20, (COALESCE(v_spent,0) / 100)::int);
  -- Visits bonus (15)
  v_visits  := LEAST(15, COALESCE(v_count,0) * 3);
  RETURN GREATEST(0, LEAST(100, v_recency + v_freq + v_value + v_visits));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.calc_recovery_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_recovery_score(uuid) TO authenticated;

-- =========================================
-- 6. REFRESH RECOVERY OPPORTUNITIES (run from cron + on-demand)
-- =========================================
CREATE OR REPLACE FUNCTION public.refresh_recovery_opportunities(_company uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Pull open return_opportunities into recovery_opportunities
  INSERT INTO public.recovery_opportunities
    (company_id, client_id, service_id, expected_return_date, potential_value, score, classification, days_late, status)
  SELECT ro.company_id, ro.client_id, ro.service_id, ro.expected_return_date,
         COALESCE(ro.estimated_value,0),
         public.calc_recovery_score(ro.client_id),
         public.classify_return(ro.expected_return_date, c.last_visit),
         GREATEST(0, CURRENT_DATE - ro.expected_return_date),
         'OPEN'
  FROM public.return_opportunities ro
  JOIN public.clients c ON c.id = ro.client_id
  WHERE ro.converted = false
    AND (_company IS NULL OR ro.company_id = _company)
  ON CONFLICT (company_id, client_id, expected_return_date) DO UPDATE SET
    potential_value = EXCLUDED.potential_value,
    score = EXCLUDED.score,
    classification = EXCLUDED.classification,
    days_late = EXCLUDED.days_late
  WHERE public.recovery_opportunities.status IN ('OPEN','IN_CONTACT');

  -- Refresh metrics on currently open rows
  UPDATE public.recovery_opportunities r
  SET days_late = GREATEST(0, CURRENT_DATE - r.expected_return_date),
      classification = public.classify_return(r.expected_return_date, c.last_visit),
      score = public.calc_recovery_score(r.client_id)
  FROM public.clients c
  WHERE c.id = r.client_id
    AND r.status IN ('OPEN','IN_CONTACT')
    AND (_company IS NULL OR r.company_id = _company);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_recovery_opportunities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_recovery_opportunities(uuid) TO authenticated;

-- =========================================
-- 7. CONVERSION TRIGGER on appointments
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_recovery_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    UPDATE public.recovery_opportunities
    SET status = 'CONVERTED',
        converted_at = now(),
        recovered_value = COALESCE(NEW.price, potential_value),
        appointment_id = NEW.id
    WHERE client_id = NEW.client_id
      AND company_id = NEW.company_id
      AND status IN ('OPEN','IN_CONTACT');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_recovery ON public.appointments;
CREATE TRIGGER trg_appointment_recovery
AFTER UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.handle_recovery_conversion();

-- =========================================
-- 8. VIEWS
-- =========================================
CREATE OR REPLACE VIEW public.recovery_dashboard
WITH (security_invoker = true) AS
SELECT
  r.company_id,
  COUNT(*) FILTER (WHERE r.status IN ('OPEN','IN_CONTACT'))                                AS pending_count,
  COUNT(*) FILTER (WHERE r.status IN ('OPEN','IN_CONTACT') AND r.classification = 'AT_RISK') AS at_risk_count,
  COUNT(*) FILTER (WHERE r.status IN ('OPEN','IN_CONTACT') AND r.classification = 'LOST')    AS lost_count,
  COALESCE(SUM(r.potential_value) FILTER (WHERE r.status IN ('OPEN','IN_CONTACT')), 0)       AS potential_revenue,
  COUNT(*) FILTER (WHERE r.status='CONVERTED' AND r.converted_at >= date_trunc('month', now())) AS recovered_count_month,
  COALESCE(SUM(r.recovered_value) FILTER (WHERE r.status='CONVERTED' AND r.converted_at >= date_trunc('month', now())), 0) AS recovered_value_month,
  CASE WHEN COUNT(*) FILTER (WHERE r.status IN ('CONVERTED','LOST')) = 0 THEN 0
       ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE r.status='CONVERTED')
                       / NULLIF(COUNT(*) FILTER (WHERE r.status IN ('CONVERTED','LOST')),0), 1)
  END AS recovery_rate,
  COALESCE(AVG(EXTRACT(EPOCH FROM (r.converted_at - r.created_at))/86400)
           FILTER (WHERE r.status='CONVERTED'), 0) AS avg_days_to_recover,
  COALESCE(AVG(r.recovered_value) FILTER (WHERE r.status='CONVERTED'), 0) AS avg_recovered_ticket
FROM public.recovery_opportunities r
GROUP BY r.company_id;

GRANT SELECT ON public.recovery_dashboard TO authenticated;

CREATE OR REPLACE VIEW public.vip_clients
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT id, company_id, name, total_spent,
         NTILE(5) OVER (PARTITION BY company_id ORDER BY total_spent DESC) AS bucket
  FROM public.clients
  WHERE total_spent > 0
)
SELECT id, company_id, name, total_spent FROM ranked WHERE bucket = 1;
GRANT SELECT ON public.vip_clients TO authenticated;

CREATE OR REPLACE VIEW public.birthday_clients
WITH (security_invoker = true) AS
SELECT id, company_id, name, phone, birthday
FROM public.clients
WHERE birthday IS NOT NULL
  AND EXTRACT(MONTH FROM birthday) = EXTRACT(MONTH FROM CURRENT_DATE);
GRANT SELECT ON public.birthday_clients TO authenticated;

-- =========================================
-- 9. SEED existing return_opportunities into recovery_opportunities
-- =========================================
SELECT public.refresh_recovery_opportunities(NULL);
