
-- ===== Enums =====
DO $$ BEGIN
  CREATE TYPE public.import_status AS ENUM ('uploaded','processing','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_row_status AS ENUM ('pending','matched','review','manual','applied','skipped','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_source AS ENUM ('csv','xlsx','pdf','ofx','manual_text');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_pattern_type AS ENUM (
    'amount','description','client_name','pix_key','bank_description',
    'service_hint','product_hint','plan_hint'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ imports ============
CREATE TABLE IF NOT EXISTS public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source public.import_source NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT,
  size_bytes INT,
  status public.import_status NOT NULL DEFAULT 'uploaded',
  rows_total INT NOT NULL DEFAULT 0,
  rows_matched INT NOT NULL DEFAULT 0,
  rows_review INT NOT NULL DEFAULT 0,
  rows_failed INT NOT NULL DEFAULT 0,
  clients_created INT NOT NULL DEFAULT 0,
  clients_matched INT NOT NULL DEFAULT 0,
  transactions_created INT NOT NULL DEFAULT 0,
  appointments_created INT NOT NULL DEFAULT 0,
  revenue_identified NUMERIC(14,2) NOT NULL DEFAULT 0,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_imports_company_created ON public.imports(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imports_status ON public.imports(status) WHERE status IN ('uploaded','processing');

CREATE POLICY "imports_select" ON public.imports FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "imports_insert" ON public.imports FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "imports_update" ON public.imports FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));
CREATE POLICY "imports_delete" ON public.imports FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));

CREATE TRIGGER trg_imports_updated BEFORE UPDATE ON public.imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ import_rows ============
CREATE TABLE IF NOT EXISTS public.import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_name TEXT,
  client_phone TEXT,
  description TEXT,
  amount NUMERIC(14,2),
  occurred_at DATE,
  payment_method TEXT,
  resolved_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  resolved_offering_id UUID,
  resolved_offering_kind TEXT,
  confidence INT NOT NULL DEFAULT 0,
  status public.import_row_status NOT NULL DEFAULT 'pending',
  action_taken TEXT,
  appointment_id UUID,
  transaction_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_import_rows_import ON public.import_rows(import_id, row_index);
CREATE INDEX IF NOT EXISTS idx_import_rows_company_status ON public.import_rows(company_id, status);
CREATE INDEX IF NOT EXISTS idx_import_rows_client ON public.import_rows(resolved_client_id);

CREATE POLICY "import_rows_select" ON public.import_rows FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "import_rows_insert" ON public.import_rows FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "import_rows_update" ON public.import_rows FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "import_rows_delete" ON public.import_rows FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));

CREATE TRIGGER trg_import_rows_updated BEFORE UPDATE ON public.import_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ import_errors ============
CREATE TABLE IF NOT EXISTS public.import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_id UUID REFERENCES public.import_rows(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  suggestion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.import_errors TO authenticated;
GRANT ALL ON public.import_errors TO service_role;
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_import_errors_import ON public.import_errors(import_id);
CREATE POLICY "import_errors_select" ON public.import_errors FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "import_errors_insert" ON public.import_errors FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "import_errors_delete" ON public.import_errors FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));

-- ============ import_matches ============
CREATE TABLE IF NOT EXISTS public.import_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_id UUID NOT NULL REFERENCES public.import_rows(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  confidence INT NOT NULL DEFAULT 0,
  reason TEXT,
  action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.import_matches TO authenticated;
GRANT ALL ON public.import_matches TO service_role;
ALTER TABLE public.import_matches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_import_matches_import ON public.import_matches(import_id);
CREATE POLICY "import_matches_select" ON public.import_matches FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "import_matches_insert" ON public.import_matches FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "import_matches_delete" ON public.import_matches FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));

-- ============ import_knowledge_base (IIL) ============
CREATE TABLE IF NOT EXISTS public.import_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pattern_type public.import_pattern_type NOT NULL,
  pattern_value TEXT NOT NULL,
  mapped_entity_type TEXT,
  mapped_entity_id UUID,
  mapped_label TEXT,
  confidence INT NOT NULL DEFAULT 50,
  hits INT NOT NULL DEFAULT 1,
  corrections INT NOT NULL DEFAULT 0,
  auto_approved BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_knowledge_base TO authenticated;
GRANT ALL ON public.import_knowledge_base TO service_role;
ALTER TABLE public.import_knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ikb_company_pattern
  ON public.import_knowledge_base(company_id, pattern_type, pattern_value, COALESCE(mapped_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_ikb_lookup ON public.import_knowledge_base(company_id, pattern_type, pattern_value);
CREATE INDEX IF NOT EXISTS idx_ikb_last_used ON public.import_knowledge_base(company_id, last_used_at DESC);

CREATE POLICY "ikb_select" ON public.import_knowledge_base FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "ikb_modify" ON public.import_knowledge_base FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));

CREATE TRIGGER trg_ikb_updated BEFORE UPDATE ON public.import_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ client_behavior_profiles ============
CREATE TABLE IF NOT EXISTS public.client_behavior_profiles (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  average_ticket NUMERIC(12,2) NOT NULL DEFAULT 0,
  average_recurrence_days INT,
  preferred_payment_method TEXT,
  preferred_offering_id UUID,
  preferred_offering_label TEXT,
  lifetime_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  transactions_count INT NOT NULL DEFAULT 0,
  last_transaction_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_behavior_profiles TO authenticated;
GRANT ALL ON public.client_behavior_profiles TO service_role;
ALTER TABLE public.client_behavior_profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cbp_company ON public.client_behavior_profiles(company_id);
CREATE POLICY "cbp_select" ON public.client_behavior_profiles FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "cbp_modify" ON public.client_behavior_profiles FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));

CREATE TRIGGER trg_cbp_updated BEFORE UPDATE ON public.client_behavior_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ offering_behavior_profiles ============
CREATE TABLE IF NOT EXISTS public.offering_behavior_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL,
  offering_kind TEXT NOT NULL,
  average_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  average_recurrence_days INT,
  frequency INT NOT NULL DEFAULT 0,
  conversion_rate NUMERIC(5,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, offering_id, offering_kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offering_behavior_profiles TO authenticated;
GRANT ALL ON public.offering_behavior_profiles TO service_role;
ALTER TABLE public.offering_behavior_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obp_select" ON public.offering_behavior_profiles FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "obp_modify" ON public.offering_behavior_profiles FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));

CREATE TRIGGER trg_obp_updated BEFORE UPDATE ON public.offering_behavior_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ payment_behavior_profiles ============
CREATE TABLE IF NOT EXISTS public.payment_behavior_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  hits INT NOT NULL DEFAULT 0,
  share NUMERIC(5,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, payment_method)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_behavior_profiles TO authenticated;
GRANT ALL ON public.payment_behavior_profiles TO service_role;
ALTER TABLE public.payment_behavior_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pbp_select" ON public.payment_behavior_profiles FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role,'employee'::app_role));
CREATE POLICY "pbp_modify" ON public.payment_behavior_profiles FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, 'owner'::app_role,'admin'::app_role));

CREATE TRIGGER trg_pbp_updated BEFORE UPDATE ON public.payment_behavior_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.learn_pattern(
  _company_id UUID,
  _type public.import_pattern_type,
  _value TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL,
  _label TEXT DEFAULT NULL,
  _delta INT DEFAULT 1
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID; v_hits INT; v_conf INT; v_auto BOOLEAN;
  v_norm TEXT := lower(btrim(_value));
  v_zero UUID := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  SELECT id INTO v_id FROM public.import_knowledge_base
   WHERE company_id = _company_id AND pattern_type = _type AND pattern_value = v_norm
     AND COALESCE(mapped_entity_id, v_zero) = COALESCE(_entity_id, v_zero)
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.import_knowledge_base
      (company_id, pattern_type, pattern_value, mapped_entity_type, mapped_entity_id, mapped_label, confidence, hits)
    VALUES (_company_id, _type, v_norm, _entity_type, _entity_id, _label,
            LEAST(99, GREATEST(0, 50 + _delta * 5)), GREATEST(1, _delta))
    RETURNING id, hits, confidence INTO v_id, v_hits, v_conf;
  ELSE
    UPDATE public.import_knowledge_base
       SET hits = hits + GREATEST(1, _delta),
           confidence = LEAST(99, GREATEST(0, confidence + CASE WHEN _delta > 0 THEN 2 ELSE -5 END)),
           corrections = corrections + CASE WHEN _delta < 0 THEN 1 ELSE 0 END,
           last_used_at = now()
     WHERE id = v_id
     RETURNING hits, confidence INTO v_hits, v_conf;
  END IF;

  v_auto := v_hits >= 500 OR (v_hits >= 100 AND v_conf >= 90);
  UPDATE public.import_knowledge_base SET auto_approved = v_auto WHERE id = v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.predict_offering_from_amount(
  _company_id UUID, _amount NUMERIC
) RETURNS TABLE(entity_type TEXT, entity_id UUID, label TEXT, confidence INT, reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT k.mapped_entity_type, k.mapped_entity_id, k.mapped_label, k.confidence, 'kb_amount'::TEXT
    FROM public.import_knowledge_base k
    WHERE k.company_id = _company_id
      AND k.pattern_type = 'amount'
      AND k.pattern_value = trim(to_char(_amount, 'FM999999990.00'))
      AND k.mapped_entity_id IS NOT NULL
    ORDER BY k.confidence DESC, k.hits DESC
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
    SELECT 'service'::TEXT, s.id, s.name,
           GREATEST(40, 90 - (abs(s.price - _amount) * 100 / NULLIF(_amount,0))::INT),
           'service_price_proximity'::TEXT
    FROM public.services s
    WHERE s.company_id = _company_id
      AND s.active = true
      AND s.price > 0
      AND abs(s.price - _amount) <= GREATEST(1, _amount * 0.05)
    ORDER BY abs(s.price - _amount) ASC
    LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.compute_import_confidence(
  _client_found BOOLEAN,
  _amount_match BOOLEAN,
  _desc_match BOOLEAN,
  _has_history BOOLEAN,
  _tenant_pattern BOOLEAN
) RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(100, GREATEST(0,
    (CASE WHEN _client_found THEN 30 ELSE 0 END) +
    (CASE WHEN _amount_match THEN 25 ELSE 0 END) +
    (CASE WHEN _desc_match THEN 20 ELSE 0 END) +
    (CASE WHEN _has_history THEN 15 ELSE 0 END) +
    (CASE WHEN _tenant_pattern THEN 10 ELSE 0 END)
  ));
$$;

CREATE OR REPLACE FUNCTION public.refresh_client_behavior_profile(_client_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company UUID; v_avg NUMERIC; v_count INT; v_ltv NUMERIC;
  v_last TIMESTAMPTZ; v_first TIMESTAMPTZ; v_rec INT;
BEGIN
  SELECT company_id INTO v_company FROM public.clients WHERE id = _client_id;
  IF v_company IS NULL THEN RETURN; END IF;

  SELECT COALESCE(AVG(ft.amount),0), COUNT(*), COALESCE(SUM(ft.amount),0),
         MAX(ft.transaction_date)::timestamptz, MIN(ft.transaction_date)::timestamptz
    INTO v_avg, v_count, v_ltv, v_last, v_first
  FROM public.financial_transactions ft
  JOIN public.appointments a ON a.id = ft.appointment_id
  WHERE a.client_id = _client_id AND ft.type = 'INCOME';

  IF v_count > 1 AND v_last IS NOT NULL AND v_first IS NOT NULL THEN
    v_rec := GREATEST(1, ((extract(epoch from (v_last - v_first)) / 86400) / (v_count - 1))::INT);
  END IF;

  INSERT INTO public.client_behavior_profiles
    (client_id, company_id, average_ticket, average_recurrence_days, lifetime_value, transactions_count, last_transaction_at)
  VALUES (_client_id, v_company, v_avg, v_rec, v_ltv, v_count, v_last)
  ON CONFLICT (client_id) DO UPDATE SET
    average_ticket = EXCLUDED.average_ticket,
    average_recurrence_days = EXCLUDED.average_recurrence_days,
    lifetime_value = EXCLUDED.lifetime_value,
    transactions_count = EXCLUDED.transactions_count,
    last_transaction_at = EXCLUDED.last_transaction_at,
    updated_at = now();
END; $$;
