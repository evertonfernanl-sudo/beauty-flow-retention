REVOKE EXECUTE ON FUNCTION public.enqueue_job(uuid, text, jsonb, integer, timestamptz) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_client(uuid, text, text, real) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mie_enqueue_from_opportunities(uuid) FROM anon, authenticated, PUBLIC;