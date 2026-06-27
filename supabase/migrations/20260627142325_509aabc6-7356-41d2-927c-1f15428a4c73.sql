
-- Revoke EXECUTE from anon/authenticated on internal SECURITY DEFINER functions.
-- Service role retains EXECUTE for server-side callers.

REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, uuid, app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_user_role(uuid, uuid, app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calc_recovery_score(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_clients(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mie_render_template(text, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.learn_pattern(uuid, import_pattern_type, text, text, uuid, text, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.predict_offering_from_amount(uuid, numeric) FROM anon, authenticated, PUBLIC;

-- Privileged role-management RPCs: callers go through server functions using service role.
-- assign_user_role / revoke_user_role validate caller via auth.uid() but we still
-- prefer routing through server functions to keep the API surface minimal.
