-- ============================================
-- BEAUTYFLOW V2 — FASE 1
-- Verticais, kind de ofertas, profissionais
-- ============================================

-- 1) Vertical enum
CREATE TYPE public.business_vertical AS ENUM ('BEAUTY', 'SALES', 'GYM');

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS vertical public.business_vertical NOT NULL DEFAULT 'BEAUTY';

-- 2) services.kind (SERVICE | PRODUCT | PLAN)
CREATE TYPE public.offering_kind AS ENUM ('SERVICE', 'PRODUCT', 'PLAN');

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS kind public.offering_kind NOT NULL DEFAULT 'SERVICE',
  ADD COLUMN IF NOT EXISTS billing_cycle_days INT;
-- billing_cycle_days only used when kind = PLAN

-- 3) professionals table
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  specialty TEXT,
  color TEXT NOT NULL DEFAULT '#a78bfa',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_professionals_company ON public.professionals(company_id);
CREATE INDEX idx_professionals_user ON public.professionals(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professionals_select_company" ON public.professionals
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "professionals_manage_admin" ON public.professionals
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  )
  WITH CHECK (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  );

CREATE TRIGGER trg_professionals_updated_at BEFORE UPDATE ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) appointments.professional_id (optional link)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_professional ON public.appointments(professional_id);
