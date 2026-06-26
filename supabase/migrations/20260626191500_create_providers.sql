-- Create providers table
CREATE TABLE public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document TEXT, -- CNPJ/CPF
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add provider_id column to financial_transactions
ALTER TABLE public.financial_transactions ADD COLUMN provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL;

-- Enable Row Level Security
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

-- Create policies for providers
CREATE POLICY "providers_select_own_company" ON public.providers
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "providers_insert_own_company" ON public.providers
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "providers_update_own_company" ON public.providers
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company(auth.uid()))
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "providers_delete_own_company" ON public.providers
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

-- Grant permissions on providers table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.providers TO authenticated;
GRANT ALL ON public.providers TO service_role;

-- Index for performance
CREATE INDEX idx_providers_company ON public.providers(company_id);
