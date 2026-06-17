-- 1) PROFILES: prevent users from updating their own company_id / id at policy level (defense in depth on top of existing trigger)
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND company_id IS NOT DISTINCT FROM (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 2) INTEGRATIONS: restrict SELECT to owner/admin (drop permissive employee-readable policy; "integ manage owner/admin" FOR ALL still grants read to those roles)
DROP POLICY IF EXISTS "integ select" ON public.integrations;

-- 3) STORAGE: drop duplicate permissive policies that bypass the role check via OR-combination
DROP POLICY IF EXISTS "company_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_delete" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_select" ON storage.objects;
-- Keep "company assets read own" (any company member can read) and the owner/admin write/update/delete policies already in place

-- 4) Lock down SECURITY DEFINER helper functions
-- Internal-only functions (triggers / cron-style refresh): revoke all
REVOKE ALL ON FUNCTION public.set_updated_at()                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_immutable_fields()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_appointment_income()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_appointment_completed()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_recovery_conversion()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_company_trial()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_audit_row()                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_return_opportunities()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_recovery_opportunities(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calc_recovery_score(uuid)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.classify_return(date, timestamptz)            FROM PUBLIC, anon, authenticated;

-- Helpers used inside RLS expressions: revoke from PUBLIC/anon, keep authenticated
REVOKE ALL ON FUNCTION public.get_user_company(uuid)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, uuid, public.app_role)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, uuid, VARIADIC public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_company(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, uuid, VARIADIC public.app_role[]) TO authenticated;