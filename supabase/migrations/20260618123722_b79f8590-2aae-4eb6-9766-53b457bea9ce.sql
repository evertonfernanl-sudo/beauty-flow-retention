
REVOKE EXECUTE ON FUNCTION public.enqueue_job(uuid, text, jsonb, integer, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_client(uuid, text, text, real) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.enqueue_job(uuid, text, jsonb, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_client(uuid, text, text, real) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
