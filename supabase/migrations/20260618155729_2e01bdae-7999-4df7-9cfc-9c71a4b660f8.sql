
-- 1) Bookable-company guard (SECURITY DEFINER, safe for anon WITH CHECK)
CREATE OR REPLACE FUNCTION public.is_company_bookable(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
     WHERE id = _company_id
       AND active = true
       AND onboarding_completed = true
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_company_bookable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_bookable(uuid) TO anon, authenticated, service_role;

-- 2) Tighten anon INSERT on appointments
DROP POLICY IF EXISTS "public can create online appointments" ON public.appointments;
CREATE POLICY "public can create online appointments"
ON public.appointments
FOR INSERT TO anon
WITH CHECK (
  source = 'ONLINE'::appointment_source
  AND company_id IS NOT NULL
  AND public.is_company_bookable(company_id)
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.company_id = appointments.company_id)
  AND EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_id AND s.company_id = appointments.company_id)
  AND (professional_id IS NULL OR EXISTS (
    SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.company_id = appointments.company_id AND p.active = true
  ))
);

-- 3) Tighten anon INSERT on clients
DROP POLICY IF EXISTS "public can create clients via booking" ON public.clients;
CREATE POLICY "public can create clients via booking"
ON public.clients
FOR INSERT TO anon
WITH CHECK (
  company_id IS NOT NULL
  AND public.is_company_bookable(company_id)
  AND length(COALESCE(name, '')) >= 2
  AND length(COALESCE(phone, '')) >= 8
);

-- 4) companies: restrict anon SELECT to safe columns only
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (
  id, name, slug, logo_url, address, city, state, vertical, business_hours, active, onboarding_completed
) ON public.companies TO anon;

-- 5) professionals: restrict anon SELECT to safe columns only
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (
  id, company_id, name, color, specialty, active
) ON public.professionals TO anon;

-- 6) invitations: hide tokens from regular company members; only owner/admin can read full rows
DROP POLICY IF EXISTS "invitations select same company" ON public.invitations;
CREATE POLICY "invitations select owner admin"
ON public.invitations
FOR SELECT TO authenticated
USING (
  company_id = public.get_user_company(auth.uid())
  AND public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner'::app_role, 'admin'::app_role])
);
