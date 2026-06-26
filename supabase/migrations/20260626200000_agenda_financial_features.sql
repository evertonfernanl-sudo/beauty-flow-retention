-- Alter appointments table to support blocked slots
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'BLOCKED';

ALTER TABLE public.appointments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN service_id DROP NOT NULL;

-- Alter financial_transactions table to support new fields
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS account_source TEXT;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PAID';
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS revenue_type TEXT;

-- Update get_public_busy_slots function to check for BLOCKED slots
CREATE OR REPLACE FUNCTION public.get_public_busy_slots(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_professional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  start_datetime timestamptz,
  end_datetime timestamptz,
  professional_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.start_datetime, a.end_datetime, a.professional_id
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'BLOCKED')
    AND a.start_datetime >= p_from
    AND a.start_datetime < p_to
    AND (p_professional_id IS NULL OR a.professional_id = p_professional_id);
END;
$$;
