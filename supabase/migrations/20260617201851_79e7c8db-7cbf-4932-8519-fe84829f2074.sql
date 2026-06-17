
-- =========================================
-- FEATURE FLAGS
-- =========================================
CREATE TABLE public.company_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, feature)
);

GRANT SELECT ON public.company_features TO authenticated;
GRANT ALL ON public.company_features TO service_role;
ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own features"
  ON public.company_features FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company(auth.uid()) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "platform admin manage features"
  ON public.company_features FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER tg_company_features_updated
  BEFORE UPDATE ON public.company_features
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_company_features_company ON public.company_features(company_id);

-- Default features helper
CREATE OR REPLACE FUNCTION public.has_feature(_company_id UUID, _feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.company_features
      WHERE company_id = _company_id AND feature = _feature LIMIT 1),
    -- defaults: tudo ligado exceto módulos premium
    CASE _feature
      WHEN 'white_label' THEN false
      WHEN 'public_api' THEN false
      WHEN 'marketplace' THEN false
      WHEN 'whatsapp_api' THEN false
      ELSE true
    END
  );
$$;

-- =========================================
-- JOBS QUEUE
-- =========================================
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RUNNING','DONE','FAILED','CANCELLED')),
  priority INT NOT NULL DEFAULT 5,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  result JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own jobs"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company(auth.uid()) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "platform admin manage jobs"
  ON public.jobs FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER tg_jobs_updated
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_jobs_status_scheduled ON public.jobs(status, scheduled_at) WHERE status = 'PENDING';
CREATE INDEX idx_jobs_company ON public.jobs(company_id);
CREATE INDEX idx_jobs_type ON public.jobs(type);

-- Enqueue helper
CREATE OR REPLACE FUNCTION public.enqueue_job(
  _company_id UUID,
  _type TEXT,
  _payload JSONB DEFAULT '{}'::jsonb,
  _priority INT DEFAULT 5,
  _scheduled_at TIMESTAMPTZ DEFAULT now()
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.jobs (company_id, type, payload, priority, scheduled_at, created_by)
  VALUES (_company_id, _type, COALESCE(_payload, '{}'::jsonb), _priority, _scheduled_at, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Worker claim (picks one pending job atomically)
CREATE OR REPLACE FUNCTION public.claim_next_job()
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.jobs;
BEGIN
  SELECT * INTO v_job
  FROM public.jobs
  WHERE status = 'PENDING' AND scheduled_at <= now()
  ORDER BY priority ASC, scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job.id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.jobs
  SET status = 'RUNNING',
      started_at = now(),
      attempts = attempts + 1
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- Mark job done/failed
CREATE OR REPLACE FUNCTION public.finish_job(_id UUID, _ok BOOLEAN, _result JSONB DEFAULT NULL, _error TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _ok THEN
    UPDATE public.jobs
    SET status = 'DONE', finished_at = now(), result = _result, last_error = NULL
    WHERE id = _id;
  ELSE
    UPDATE public.jobs
    SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
        finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
        scheduled_at = CASE WHEN attempts < max_attempts THEN now() + (attempts * interval '30 seconds') ELSE scheduled_at END,
        last_error = _error
    WHERE id = _id;
  END IF;
END;
$$;
