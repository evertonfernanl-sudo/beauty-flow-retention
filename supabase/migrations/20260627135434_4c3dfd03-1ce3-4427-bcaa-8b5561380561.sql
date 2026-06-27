
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'BLOCKED';

ALTER TABLE public.appointments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN service_id DROP NOT NULL;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS provider_id uuid,
  ADD COLUMN IF NOT EXISTS account_source text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PAID',
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revenue_type text;

CREATE TABLE IF NOT EXISTS public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  document text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.providers TO authenticated;
GRANT ALL ON public.providers TO service_role;

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view providers"
  ON public.providers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id = providers.company_id));

CREATE POLICY "Members can insert providers"
  ON public.providers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id = providers.company_id));

CREATE POLICY "Members can update providers"
  ON public.providers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id = providers.company_id));

CREATE POLICY "Members can delete providers"
  ON public.providers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id = providers.company_id));

CREATE TRIGGER set_providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE SET NULL;
