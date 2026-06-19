
-- 1) Cross-tenant guards on SECURITY DEFINER RPCs
CREATE OR REPLACE FUNCTION public.enqueue_job(_company_id uuid, _type text, _payload jsonb DEFAULT '{}'::jsonb, _priority integer DEFAULT 5, _scheduled_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.has_any_role(v_uid, _company_id, 'owner'::public.app_role, 'admin'::public.app_role, 'employee'::public.app_role)
          OR public.is_platform_admin(v_uid)) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;
  IF _type NOT IN ('noop','recovery.refresh','returns.refresh','import.commit','campaign.record','import.parse','import.apply_row') THEN
    RAISE EXCEPTION 'job type not allowed';
  END IF;
  INSERT INTO public.jobs (company_id, type, payload, priority, scheduled_at, created_by)
  VALUES (_company_id, _type, COALESCE(_payload, '{}'::jsonb), _priority, _scheduled_at, v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.learn_pattern(_company_id uuid, _type import_pattern_type, _value text, _entity_type text DEFAULT NULL::text, _entity_id uuid DEFAULT NULL::uuid, _label text DEFAULT NULL::text, _delta integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID; v_hits INT; v_conf INT; v_auto BOOLEAN;
  v_norm TEXT := lower(btrim(_value));
  v_zero UUID := '00000000-0000-0000-0000-000000000000'::uuid;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.has_any_role(v_uid, _company_id, 'owner'::public.app_role, 'admin'::public.app_role, 'employee'::public.app_role)
          OR public.is_platform_admin(v_uid)) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  SELECT id INTO v_id FROM public.import_knowledge_base
   WHERE company_id = _company_id AND pattern_type = _type AND pattern_value = v_norm
     AND COALESCE(mapped_entity_id, v_zero) = COALESCE(_entity_id, v_zero)
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.import_knowledge_base
      (company_id, pattern_type, pattern_value, mapped_entity_type, mapped_entity_id, mapped_label, confidence, hits)
    VALUES (_company_id, _type, v_norm, _entity_type, _entity_id, _label,
            LEAST(99, GREATEST(0, 50 + _delta * 5)), GREATEST(1, _delta))
    RETURNING id, hits, confidence INTO v_id, v_hits, v_conf;
  ELSE
    UPDATE public.import_knowledge_base
       SET hits = hits + GREATEST(1, _delta),
           confidence = LEAST(99, GREATEST(0, confidence + CASE WHEN _delta > 0 THEN 2 ELSE -5 END)),
           corrections = corrections + CASE WHEN _delta < 0 THEN 1 ELSE 0 END,
           last_used_at = now()
     WHERE id = v_id
     RETURNING hits, confidence INTO v_hits, v_conf;
  END IF;

  v_auto := v_hits >= 500 OR (v_hits >= 100 AND v_conf >= 90);
  UPDATE public.import_knowledge_base SET auto_approved = v_auto WHERE id = v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.mie_enqueue_from_opportunities(_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_offsets integer[];
  v_plan text;
  v_limit integer;
  v_used integer;
  v_offset integer;
  r record;
  v_tpl public.message_templates;
  v_type public.message_type;
  v_body text;
  v_sched timestamptz;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.has_any_role(v_uid, _company_id, 'owner'::public.app_role, 'admin'::public.app_role)
          OR public.is_platform_admin(v_uid)) THEN
    RAISE EXCEPTION 'not authorized for this company';
  END IF;

  SELECT plan::text INTO v_plan FROM public.companies WHERE id = _company_id;
  v_limit := CASE coalesce(v_plan,'starter')
    WHEN 'basic' THEN 500
    WHEN 'pro' THEN 5000
    WHEN 'growth' THEN 20000
    ELSE 500 END;
  SELECT count(*) INTO v_used FROM public.message_logs
    WHERE company_id = _company_id AND event = 'SENT'
      AND created_at >= date_trunc('month', now());
  IF v_used >= v_limit THEN RETURN 0; END IF;

  FOR r IN
    SELECT ro.* FROM public.recovery_opportunities ro
    WHERE ro.company_id = _company_id AND ro.status IN ('OPEN','IN_CONTACT')
    ORDER BY ro.score DESC NULLS LAST
    LIMIT 500
  LOOP
    v_type := CASE r.classification
      WHEN 'LOST' THEN 'REACTIVATION'::message_type
      WHEN 'AT_RISK' THEN 'RETURN'::message_type
      ELSE 'RETURN'::message_type
    END;
    SELECT * INTO v_tpl FROM public.message_templates
      WHERE company_id = _company_id AND type = v_type AND active = true
      ORDER BY is_default DESC NULLS LAST, updated_at DESC LIMIT 1;
    IF v_tpl.id IS NULL THEN CONTINUE; END IF;
    v_offsets := coalesce(v_tpl.cadence_offsets, ARRAY[-7,-3,0,7]);

    FOREACH v_offset IN ARRAY v_offsets LOOP
      v_sched := (r.expected_return_date + v_offset)::timestamptz + interval '9 hours';
      IF v_sched < now() - interval '2 days' THEN CONTINUE; END IF;
      v_body := public.mie_render_template(v_tpl.body, r.client_id);
      BEGIN
        INSERT INTO public.message_queue
          (company_id, client_id, opportunity_id, template_id, type, channel,
           priority, offset_days, scheduled_at, rendered_body, status)
        VALUES
          (_company_id, r.client_id, r.id, v_tpl.id, v_type, v_tpl.channel,
           CASE v_type WHEN 'COLLECTION' THEN 100 WHEN 'RENEWAL' THEN 95
                       WHEN 'REPURCHASE' THEN 90 WHEN 'REACTIVATION' THEN 80 ELSE 85 END,
           v_offset, v_sched, v_body,
           CASE WHEN v_sched <= now() THEN 'READY' ELSE 'PENDING' END);
        v_count := v_count + 1;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  UPDATE public.message_queue SET status = 'READY'
    WHERE company_id = _company_id AND status = 'PENDING' AND scheduled_at <= now();
  RETURN v_count;
END $function$;

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
  v_out text := _body;
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
  v_first := split_part(coalesce(v_client.name,''), ' ', 1);
  v_out := regexp_replace(v_out, '\{\{\s*primeiro_nome\s*\}\}', v_first, 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*cliente\s*\}\}', coalesce(v_client.name,''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*nome\s*\}\}', v_first, 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*empresa\s*\}\}', coalesce(v_company.name,''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*link_agendamento\s*\}\}',
    'https://beauty-flow-retention.lovable.app/agendar/' || coalesce(v_company.slug,''), 'gi');
  RETURN v_out;
END $function$;

-- 2) Anonymous column-level access for companies (safe cols only)
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (id, name, slug, logo_url, address, city, state, vertical, business_hours, active, onboarding_completed)
  ON public.companies TO anon;

-- 3) Anonymous column-level access for professionals (safe cols only)
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (id, company_id, name, color, specialty, active)
  ON public.professionals TO anon;

-- 4) Scope user_roles SELECT to the caller's current company
DROP POLICY IF EXISTS "users view roles in own company" ON public.user_roles;
CREATE POLICY "users view roles in own company"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  company_id = public.get_user_company(auth.uid())
  AND (
    user_id = auth.uid()
    OR public.has_any_role(auth.uid(), company_id, 'owner'::public.app_role, 'admin'::public.app_role)
  )
);
