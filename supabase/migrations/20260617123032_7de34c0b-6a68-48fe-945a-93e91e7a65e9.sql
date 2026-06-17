
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS business_hours JSONB NOT NULL DEFAULT '{"mon":{"open":"09:00","close":"18:00","closed":false},"tue":{"open":"09:00","close":"18:00","closed":false},"wed":{"open":"09:00","close":"18:00","closed":false},"thu":{"open":"09:00","close":"18:00","closed":false},"fri":{"open":"09:00","close":"18:00","closed":false},"sat":{"open":"09:00","close":"14:00","closed":false},"sun":{"open":"09:00","close":"18:00","closed":true}}'::jsonb,
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{"language":"pt-BR","timezone":"America/Sao_Paulo","currency":"BRL","date_format":"DD/MM/YYYY"}'::jsonb,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days');

CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  monthly_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  yearly_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_clients INT, max_users INT,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "plans readable to all" ON public.plans FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.plans (id, name, description, monthly_price, yearly_price, max_clients, max_users, features, sort_order) VALUES
  ('starter',      'Starter',      'Para profissionais começando.', 49.90,  479.00,  500,  1,    '{"clients":true,"agenda":true,"returns":true,"financial":true,"reports":true,"users":false,"ai":false,"integrations":false}'::jsonb, 1),
  ('professional', 'Professional', 'Para salões em crescimento.',   99.90,  959.00,  3000, 5,    '{"clients":true,"agenda":true,"returns":true,"financial":true,"reports":true,"users":true,"ai":false,"integrations":true}'::jsonb, 2),
  ('premium',      'Premium',      'Para grandes operações.',       199.90, 1919.00, NULL, NULL, '{"clients":true,"agenda":true,"returns":true,"financial":true,"reports":true,"users":true,"ai":true,"integrations":true}'::jsonb, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price, yearly_price = EXCLUDED.yearly_price,
  max_clients = EXCLUDED.max_clients, max_users = EXCLUDED.max_users,
  features = EXCLUDED.features, sort_order = EXCLUDED.sort_order, updated_at = now();

DO $$ BEGIN CREATE TYPE public.subscription_status AS ENUM ('TRIAL','ACTIVE','PAST_DUE','CANCELED','PENDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),
  status public.subscription_status NOT NULL DEFAULT 'TRIAL',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  trial_ends_at TIMESTAMPTZ,
  gateway TEXT, gateway_subscription_id TEXT,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "subs select own company" ON public.subscriptions FOR SELECT TO authenticated
    USING (company_id = public.get_user_company(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "subs owner manage" ON public.subscriptions FOR ALL TO authenticated
    USING (company_id = public.get_user_company(auth.uid()) AND public.has_role(auth.uid(), company_id, 'owner'))
    WITH CHECK (company_id = public.get_user_company(auth.uid()) AND public.has_role(auth.uid(), company_id, 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_subs_updated ON public.subscriptions;
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN CREATE TYPE public.invoice_status AS ENUM ('OPEN','PAID','PAST_DUE','CANCELED','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'OPEN',
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + 7),
  paid_at TIMESTAMPTZ,
  gateway TEXT, gateway_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "inv select own" ON public.invoices FOR SELECT TO authenticated
    USING (company_id = public.get_user_company(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "inv owner manage" ON public.invoices FOR ALL TO authenticated
    USING (company_id = public.get_user_company(auth.uid()) AND public.has_role(auth.uid(), company_id, 'owner'))
    WITH CHECK (company_id = public.get_user_company(auth.uid()) AND public.has_role(auth.uid(), company_id, 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_inv_updated ON public.invoices;
CREATE TRIGGER trg_inv_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.invoices (company_id, created_at DESC);

DO $$ BEGIN CREATE TYPE public.invitation_status AS ENUM ('PENDING','ACCEPTED','EXPIRED','CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  status public.invitation_status NOT NULL DEFAULT 'PENDING',
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "invitations select same company" ON public.invitations FOR SELECT TO authenticated
    USING (company_id = public.get_user_company(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "invitations manage owner/admin" ON public.invitations FOR ALL TO authenticated
    USING (company_id = public.get_user_company(auth.uid()) AND public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner','admin']::app_role[]))
    WITH CHECK (company_id = public.get_user_company(auth.uid()) AND public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner','admin']::app_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_invitations_updated ON public.invitations;
CREATE TRIGGER trg_invitations_updated BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_invitations_company ON public.invitations (company_id, status);

CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "integ select" ON public.integrations FOR SELECT TO authenticated
    USING (company_id = public.get_user_company(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "integ manage owner/admin" ON public.integrations FOR ALL TO authenticated
    USING (company_id = public.get_user_company(auth.uid()) AND public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner','admin']::app_role[]))
    WITH CHECK (company_id = public.get_user_company(auth.uid()) AND public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner','admin']::app_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_integrations_updated ON public.integrations;
CREATE TRIGGER trg_integrations_updated BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_company_trial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.subscriptions (company_id, plan_id, status, amount, trial_ends_at, current_period_end)
  VALUES (NEW.id, COALESCE(NEW.plan::text, 'starter'), 'TRIAL', 0, NEW.trial_ends_at, NEW.trial_ends_at)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_company_trial ON public.companies;
CREATE TRIGGER trg_company_trial AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.handle_company_trial();

INSERT INTO public.subscriptions (company_id, plan_id, status, amount, trial_ends_at, current_period_end)
SELECT c.id, COALESCE(c.plan::text, 'starter'), 'TRIAL', 0,
       COALESCE(c.trial_ends_at, now() + interval '14 days'),
       COALESCE(c.trial_ends_at, now() + interval '14 days')
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "company assets read own" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'company-assets' AND (storage.foldername(name))[1] = public.get_user_company(auth.uid())::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "company assets write owner/admin" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'company-assets'
      AND (storage.foldername(name))[1] = public.get_user_company(auth.uid())::text
      AND public.has_any_role(auth.uid(), public.get_user_company(auth.uid()), VARIADIC ARRAY['owner','admin']::app_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "company assets update owner/admin" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'company-assets' AND (storage.foldername(name))[1] = public.get_user_company(auth.uid())::text
      AND public.has_any_role(auth.uid(), public.get_user_company(auth.uid()), VARIADIC ARRAY['owner','admin']::app_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "company assets delete owner/admin" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'company-assets' AND (storage.foldername(name))[1] = public.get_user_company(auth.uid())::text
      AND public.has_any_role(auth.uid(), public.get_user_company(auth.uid()), VARIADIC ARRAY['owner','admin']::app_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
