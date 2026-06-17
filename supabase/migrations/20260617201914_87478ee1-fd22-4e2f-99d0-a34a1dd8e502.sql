
REVOKE ALL ON FUNCTION public.claim_next_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_job(UUID, BOOLEAN, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_job(UUID, BOOLEAN, JSONB, TEXT) TO service_role;
