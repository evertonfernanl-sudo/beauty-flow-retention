CREATE OR REPLACE FUNCTION public.mie_render_template(_body text, _client_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client public.clients;
  v_company public.companies;
  v_first text;
  v_out text;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE id = _client_id;
  IF v_client.id IS NULL THEN RETURN _body; END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF v_client.company_id IS DISTINCT FROM public.get_user_company(v_uid)
     AND NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  SELECT * INTO v_company FROM public.companies WHERE id = v_client.company_id;
  
  v_out := _body;
  IF v_out NOT ILIKE '%{{%link_agendamento%}}%' THEN
    v_out := rtrim(v_out) || E'\n\nAgende seu horário aqui: {{link_agendamento}}';
  END IF;

  v_first := split_part(coalesce(v_client.name,''), ' ', 1);
  v_out := regexp_replace(v_out, '\{\{\s*primeiro_nome\s*\}\}', v_first, 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*cliente\s*\}\}', coalesce(v_client.name,''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*nome\s*\}\}', v_first, 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*empresa\s*\}\}', coalesce(v_company.name,''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*link_agendamento\s*\}\}',
    'https://beauty-flow-retention.lovable.app/agendar/' || coalesce(v_company.slug,''), 'gi');
  RETURN v_out;
END $function$;
