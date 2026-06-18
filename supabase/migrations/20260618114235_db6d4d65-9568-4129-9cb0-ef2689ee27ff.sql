
REVOKE EXECUTE ON FUNCTION public.learn_pattern(uuid, public.import_pattern_type, text, text, uuid, text, int) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.predict_offering_from_amount(uuid, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_client_behavior_profile(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.learn_pattern(uuid, public.import_pattern_type, text, text, uuid, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.predict_offering_from_amount(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_client_behavior_profile(uuid) TO authenticated, service_role;
