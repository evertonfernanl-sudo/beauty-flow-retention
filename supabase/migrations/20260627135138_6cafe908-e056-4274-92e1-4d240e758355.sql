
-- 1) Restrict anon column access on companies to safe cols only
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (id, name, slug, logo_url, address, city, state, vertical, business_hours, active, onboarding_completed) ON public.companies TO anon;

-- 2) Restrict anon column access on professionals to safe cols only
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (id, company_id, name, color, specialty, active) ON public.professionals TO anon;

-- 3) Harden app_logs insert: validate payload shape and bound lengths
DROP POLICY IF EXISTS "Anyone can insert logs" ON public.app_logs;
CREATE POLICY "Bounded log inserts" ON public.app_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    coalesce(length(slug), 0) <= 100
    AND coalesce(length(path), 0) <= 200
    AND coalesce(length(error), 0) <= 200
    AND coalesce(length(user_agent), 0) <= 500
    AND error IS NOT NULL
    AND error IN ('COMPANY_NOT_FOUND','BOOKING_FAILED','SLOT_UNAVAILABLE','VALIDATION_ERROR','LOAD_ERROR')
  );

-- 4) Fix mutable search_path on merge_clients
CREATE OR REPLACE FUNCTION public.merge_clients(source_id uuid, target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_source_company_id UUID;
  v_target_company_id UUID;
BEGIN
  v_company_id := public.get_user_company(auth.uid());
  SELECT company_id INTO v_source_company_id FROM public.clients WHERE id = source_id;
  SELECT company_id INTO v_target_company_id FROM public.clients WHERE id = target_id;
  IF v_source_company_id IS NULL OR v_target_company_id IS NULL THEN
    RAISE EXCEPTION 'Um ou ambos os clientes não foram encontrados.';
  END IF;
  IF v_source_company_id <> v_company_id OR v_target_company_id <> v_company_id THEN
    RAISE EXCEPTION 'Acesso negado: os clientes devem pertencer à mesma empresa do usuário.';
  END IF;
  UPDATE public.appointments SET client_id = target_id WHERE client_id = source_id;
  UPDATE public.message_logs SET client_id = target_id WHERE client_id = source_id;
  UPDATE public.message_queue SET client_id = target_id WHERE client_id = source_id;
  UPDATE public.recovery_opportunities SET client_id = target_id WHERE client_id = source_id;
  UPDATE public.import_rows SET resolved_client_id = target_id WHERE resolved_client_id = source_id;
  UPDATE public.providers SET client_id = target_id WHERE client_id = source_id;
  DELETE FROM public.clients WHERE id = source_id;
END;
$function$;
