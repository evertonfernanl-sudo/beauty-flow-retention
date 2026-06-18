
-- 1. Lock down user_roles writes
DROP POLICY IF EXISTS "user_roles_owner_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_owner_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_owner_delete" ON public.user_roles;
-- (only the existing select policy "users view roles in own company" remains for authenticated reads)

-- 2. SECURITY DEFINER RPC for controlled role assignment
CREATE OR REPLACE FUNCTION public.assign_user_role(
  _target_user uuid,
  _company_id uuid,
  _role public.app_role
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_role(v_caller, _company_id, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'only company owners can assign roles';
  END IF;
  IF _target_user = v_caller THEN
    RAISE EXCEPTION 'cannot change your own role';
  END IF;
  IF _role = 'owner'::public.app_role THEN
    RAISE EXCEPTION 'owner role can only be set during company creation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _target_user AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'target user is not a member of this company';
  END IF;

  INSERT INTO public.user_roles(user_id, company_id, role)
  VALUES (_target_user, _company_id, _role)
  ON CONFLICT (user_id, company_id, role) DO NOTHING;
END $$;

REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.assign_user_role(uuid, uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_user_role(
  _target_user uuid,
  _company_id uuid,
  _role public.app_role
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_role(v_caller, _company_id, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'only company owners can revoke roles';
  END IF;
  IF _target_user = v_caller THEN
    RAISE EXCEPTION 'cannot change your own role';
  END IF;
  IF _role = 'owner'::public.app_role THEN
    RAISE EXCEPTION 'owner role cannot be revoked via this function';
  END IF;
  DELETE FROM public.user_roles
   WHERE user_id = _target_user AND company_id = _company_id AND role = _role;
END $$;

REVOKE EXECUTE ON FUNCTION public.revoke_user_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.revoke_user_role(uuid, uuid, public.app_role) TO authenticated, service_role;

-- 3. Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions in public schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', r.nspname, r.proname, r.args);
  END LOOP;
END $$;
