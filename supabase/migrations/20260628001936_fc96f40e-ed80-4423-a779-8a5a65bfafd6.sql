
-- COMPANIES: limit anon to safe columns only
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (id, name, slug, logo_url, instagram, address, city, state, business_hours, vertical, active, onboarding_completed) ON public.companies TO anon;

-- PROFESSIONALS: limit anon to safe columns only
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (id, company_id, name, color, specialty, active) ON public.professionals TO anon;

-- INVITATIONS: hide token column from authenticated role; service_role/definer functions still see it
REVOKE SELECT ON public.invitations FROM authenticated;
GRANT SELECT (id, company_id, email, role, status, invited_by, expires_at, accepted_at, created_at, updated_at) ON public.invitations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
