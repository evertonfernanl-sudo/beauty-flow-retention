
-- COMPANIES: restrict anon to safe columns only
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (id, name, slug, logo_url, instagram, address, city, state, business_hours, vertical, active, onboarding_completed) ON public.companies TO anon;

-- PROFESSIONALS: restrict anon to safe columns only
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (id, company_id, name, color, specialty, active) ON public.professionals TO anon;

-- INVITATIONS: remove all PostgREST access from authenticated; tokens are server-only
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invitations FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invitations FROM anon;
-- service_role retains full access for edge functions / security-definer functions
GRANT ALL ON public.invitations TO service_role;
