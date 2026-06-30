
-- 1) v3_imports
CREATE TABLE public.v3_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('csv','xlsx','pdf','ofx','manual_text')),
  filename text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsing','review','applied','failed')),
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.v3_imports TO authenticated;
GRANT ALL ON public.v3_imports TO service_role;
ALTER TABLE public.v3_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v3_imports_members_all" ON public.v3_imports
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()));
CREATE INDEX idx_v3_imports_company ON public.v3_imports(company_id, created_at DESC);
CREATE TRIGGER trg_v3_imports_updated_at BEFORE UPDATE ON public.v3_imports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) v3_import_rows
CREATE TABLE public.v3_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.v3_imports(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  original_snapshot jsonb NOT NULL,
  canonical jsonb NOT NULL,
  suggestions jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_result jsonb,
  protected_fields text[] NOT NULL DEFAULT ARRAY['client_name','description','amount','transaction_date','balance','document','cpf_cnpj','phone'],
  resolved_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  resolved_service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review','matched','applied','failed','skipped')),
  confidence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_id, row_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.v3_import_rows TO authenticated;
GRANT ALL ON public.v3_import_rows TO service_role;
ALTER TABLE public.v3_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v3_import_rows_members_all" ON public.v3_import_rows
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()));
CREATE INDEX idx_v3_rows_import ON public.v3_import_rows(import_id, row_index);
CREATE INDEX idx_v3_rows_company_status ON public.v3_import_rows(company_id, status);
CREATE TRIGGER trg_v3_rows_updated_at BEFORE UPDATE ON public.v3_import_rows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) v3_row_snapshots
CREATE TABLE public.v3_row_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid NOT NULL REFERENCES public.v3_import_rows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stage text NOT NULL,
  payload jsonb NOT NULL,
  reason text,
  decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.v3_row_snapshots TO authenticated;
GRANT ALL ON public.v3_row_snapshots TO service_role;
ALTER TABLE public.v3_row_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v3_row_snapshots_members_select" ON public.v3_row_snapshots
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "v3_row_snapshots_members_insert" ON public.v3_row_snapshots
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()));
CREATE INDEX idx_v3_snapshots_row ON public.v3_row_snapshots(row_id, decided_at);

-- 4) v3_audit_log (reason obrigatório)
CREATE TABLE public.v3_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES public.v3_imports(id) ON DELETE CASCADE,
  row_id uuid REFERENCES public.v3_import_rows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stage text NOT NULL,
  event text NOT NULL,
  input jsonb,
  output jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.v3_audit_log TO authenticated;
GRANT ALL ON public.v3_audit_log TO service_role;
ALTER TABLE public.v3_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v3_audit_log_members_select" ON public.v3_audit_log
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "v3_audit_log_members_insert" ON public.v3_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()));
CREATE INDEX idx_v3_audit_row ON public.v3_audit_log(row_id, created_at);
CREATE INDEX idx_v3_audit_import ON public.v3_audit_log(import_id, created_at);

-- 5) v3_financial_transactions
CREATE TABLE public.v3_financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  v3_row_id uuid REFERENCES public.v3_import_rows(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('INCOME','EXPENSE')),
  category text,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  transaction_date date NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  notes text,
  engine text NOT NULL DEFAULT 'v3',
  is_personal boolean NOT NULL DEFAULT false,
  revenue_type text,
  status text NOT NULL DEFAULT 'CONFIRMED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.v3_financial_transactions TO authenticated;
GRANT ALL ON public.v3_financial_transactions TO service_role;
ALTER TABLE public.v3_financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v3_ftx_members_all" ON public.v3_financial_transactions
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_any_role(auth.uid(), company_id,'owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role) OR public.is_platform_admin(auth.uid()));
CREATE INDEX idx_v3_ftx_company_date ON public.v3_financial_transactions(company_id, transaction_date DESC);
CREATE TRIGGER trg_v3_ftx_updated_at BEFORE UPDATE ON public.v3_financial_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Trigger guardião
CREATE OR REPLACE FUNCTION public.v3_guard_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  restored boolean := false;
  old_val jsonb;
  new_val jsonb;
  snap_val jsonb;
BEGIN
  IF NEW.original_snapshot IS DISTINCT FROM OLD.original_snapshot THEN
    NEW.original_snapshot := OLD.original_snapshot;
    restored := true;
  END IF;

  IF NEW.canonical IS DISTINCT FROM OLD.canonical THEN
    FOREACH k IN ARRAY OLD.protected_fields LOOP
      old_val := OLD.canonical -> k;
      new_val := NEW.canonical -> k;
      snap_val := OLD.original_snapshot -> k;
      IF new_val IS DISTINCT FROM old_val THEN
        NEW.canonical := jsonb_set(NEW.canonical, ARRAY[k], COALESCE(snap_val, 'null'::jsonb), true);
        restored := true;
      END IF;
    END LOOP;
  END IF;

  IF restored THEN
    INSERT INTO public.v3_audit_log (import_id, row_id, company_id, stage, event, input, output, reason)
    VALUES (NEW.import_id, NEW.id, NEW.company_id, 'validator', 'PROTECTED_RESTORE',
      to_jsonb(OLD), to_jsonb(NEW), 'Campo protegido restaurado automaticamente pelo guardião V3');
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.v3_guard_protected_fields() FROM PUBLIC;
CREATE TRIGGER trg_v3_guard_protected BEFORE UPDATE ON public.v3_import_rows FOR EACH ROW EXECUTE FUNCTION public.v3_guard_protected_fields();

-- 7) View de auditoria
CREATE OR REPLACE VIEW public.v3_row_audit AS
SELECT
  r.id AS row_id, r.import_id, r.company_id, r.row_index, r.status, r.confidence,
  r.original_snapshot, r.canonical, r.suggestions, r.processing_metadata, r.applied_result,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('stage',s.stage,'payload',s.payload,'reason',s.reason,'decided_at',s.decided_at) ORDER BY s.decided_at)
     FROM public.v3_row_snapshots s WHERE s.row_id = r.id), '[]'::jsonb) AS snapshots,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('stage',a.stage,'event',a.event,'reason',a.reason,'input',a.input,'output',a.output,'created_at',a.created_at) ORDER BY a.created_at)
     FROM public.v3_audit_log a WHERE a.row_id = r.id), '[]'::jsonb) AS audit_trail
FROM public.v3_import_rows r;

GRANT SELECT ON public.v3_row_audit TO authenticated;
GRANT ALL ON public.v3_row_audit TO service_role;
