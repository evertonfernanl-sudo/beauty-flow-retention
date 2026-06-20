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
           CASE WHEN v_sched <= now() THEN 'READY'::public.message_queue_status ELSE 'PENDING'::public.message_queue_status END);
        v_count := v_count + 1;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  UPDATE public.message_queue SET status = 'READY'::public.message_queue_status
    WHERE company_id = _company_id AND status = 'PENDING'::public.message_queue_status AND scheduled_at <= now();
  RETURN v_count;
END $function$;
