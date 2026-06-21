-- Companies: restrict anon to safe columns only
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (
  id, name, slug, logo_url, address, city, state, vertical,
  business_hours, active, onboarding_completed
) ON public.companies TO anon;

-- Professionals: restrict anon to safe columns only
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (
  id, company_id, name, color, specialty, active
) ON public.professionals TO anon;