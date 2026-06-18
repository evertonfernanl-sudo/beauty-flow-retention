
-- 1. Drop public anon SELECT on appointments (booking uses v_public_busy_slots view)
DROP POLICY IF EXISTS "public can read appointment slots" ON public.appointments;

-- 2. Companies: drop full-row anon policy, recreate with column-level restriction.
DROP POLICY IF EXISTS "public can view active companies" ON public.companies;
CREATE POLICY "public can view active companies (safe cols)"
  ON public.companies FOR SELECT TO anon
  USING (active = true AND onboarding_completed = true);
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (id, name, slug, logo_url, address, city, state, vertical, business_hours, active, onboarding_completed)
  ON public.companies TO anon;

-- 3. Professionals: same approach
DROP POLICY IF EXISTS "public can view active professionals" ON public.professionals;
CREATE POLICY "public can view active professionals (safe cols)"
  ON public.professionals FOR SELECT TO anon
  USING (active = true);
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (id, company_id, name, color, specialty, active) ON public.professionals TO anon;

-- 4. Storage UPDATE policy for imports bucket
DROP POLICY IF EXISTS "imports_bucket_update" ON storage.objects;
CREATE POLICY "imports_bucket_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'imports'
    AND public.has_any_role(auth.uid(), split_part(name,'/',1)::uuid,
        VARIADIC ARRAY['owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role])
  )
  WITH CHECK (
    bucket_id = 'imports'
    AND public.has_any_role(auth.uid(), split_part(name,'/',1)::uuid,
        VARIADIC ARRAY['owner'::public.app_role,'admin'::public.app_role,'employee'::public.app_role])
  );

-- 5. Fix function search_path
ALTER FUNCTION public.compute_import_confidence(boolean, boolean, boolean, boolean, boolean) SET search_path = public;
