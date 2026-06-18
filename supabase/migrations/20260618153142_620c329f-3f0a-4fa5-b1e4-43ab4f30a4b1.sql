
-- 1. Extend message_templates
DO $$ BEGIN
  CREATE TYPE public.message_type AS ENUM ('RETURN','REPURCHASE','RENEWAL','REACTIVATION','COLLECTION','BIRTHDAY','FOLLOW_UP','CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_channel AS ENUM ('WHATSAPP','EMAIL','SMS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_queue_status AS ENUM ('PENDING','READY','SENT','SKIPPED','CONVERTED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_event_type AS ENUM ('SENT','DELIVERED','READ','REPLIED','CONVERTED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS type public.message_type NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN IF NOT EXISTS channel public.message_channel NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cadence_offsets integer[] NOT NULL DEFAULT ARRAY[-7,-3,0,7]::integer[];

-- Owners/admins can update templates; members can read (existing policies kept, add admin gate for write)
DROP POLICY IF EXISTS "owners and admins manage templates" ON public.message_templates;
CREATE POLICY "owners and admins manage templates"
  ON public.message_templates
  FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner'::app_role,'admin'::app_role]));

-- 2. message_queue
CREATE TABLE IF NOT EXISTS public.message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.recovery_opportunities(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  type public.message_type NOT NULL,
  channel public.message_channel NOT NULL DEFAULT 'WHATSAPP',
  priority integer NOT NULL DEFAULT 85,
  offset_days integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  rendered_body text NOT NULL,
  status public.message_queue_status NOT NULL DEFAULT 'PENDING',
  sent_at timestamptz,
  converted_at timestamptz,
  recovered_value numeric(12,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_id, opportunity_id, offset_days)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_queue TO authenticated;
GRANT ALL ON public.message_queue TO service_role;
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read message_queue" ON public.message_queue FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "members update message_queue" ON public.message_queue FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company(auth.uid()))
  WITH CHECK (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "members insert message_queue" ON public.message_queue FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "admins delete message_queue" ON public.message_queue FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner'::app_role,'admin'::app_role]));

CREATE INDEX IF NOT EXISTS idx_mq_company_status ON public.message_queue(company_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_mq_client ON public.message_queue(client_id);

CREATE TRIGGER trg_mq_updated_at BEFORE UPDATE ON public.message_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. message_logs
CREATE TABLE IF NOT EXISTS public.message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  queue_id uuid REFERENCES public.message_queue(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  event public.message_event_type NOT NULL,
  channel public.message_channel NOT NULL DEFAULT 'WHATSAPP',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.message_logs TO authenticated;
GRANT ALL ON public.message_logs TO service_role;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read logs" ON public.message_logs FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "members insert logs" ON public.message_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ml_company_event ON public.message_logs(company_id, event, created_at);
CREATE INDEX IF NOT EXISTS idx_ml_template ON public.message_logs(template_id, event);

-- 4. Render function
CREATE OR REPLACE FUNCTION public.mie_render_template(_body text, _client_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_client public.clients;
  v_company public.companies;
  v_first text;
  v_out text := _body;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE id = _client_id;
  IF v_client.id IS NULL THEN RETURN _body; END IF;
  SELECT * INTO v_company FROM public.companies WHERE id = v_client.company_id;
  v_first := split_part(coalesce(v_client.name,''), ' ', 1);
  v_out := regexp_replace(v_out, '\{\{\s*primeiro_nome\s*\}\}', v_first, 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*cliente\s*\}\}', coalesce(v_client.name,''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*nome\s*\}\}', v_first, 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*empresa\s*\}\}', coalesce(v_company.name,''), 'gi');
  v_out := regexp_replace(v_out, '\{\{\s*link_agendamento\s*\}\}',
    'https://beauty-flow-retention.lovable.app/agendar/' || coalesce(v_company.slug,''), 'gi');
  RETURN v_out;
END $$;

-- 5. Enqueue from opportunities
CREATE OR REPLACE FUNCTION public.mie_enqueue_from_opportunities(_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
BEGIN
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
        -- already enqueued
        NULL;
      END;
    END LOOP;
  END LOOP;

  -- promote PENDING → READY when due
  UPDATE public.message_queue SET status = 'READY'
    WHERE company_id = _company_id AND status = 'PENDING' AND scheduled_at <= now();
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.mie_enqueue_from_opportunities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mie_enqueue_from_opportunities(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mie_render_template(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mie_render_template(text, uuid) TO authenticated, service_role;

-- 6. Conversion trigger on appointments completed
CREATE OR REPLACE FUNCTION public.mie_handle_conversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    UPDATE public.message_queue
      SET status = 'CONVERTED', converted_at = now(),
          recovered_value = COALESCE(NEW.price, recovered_value)
      WHERE client_id = NEW.client_id
        AND company_id = NEW.company_id
        AND status IN ('SENT','READY')
        AND sent_at >= now() - interval '30 days';
    INSERT INTO public.message_logs (company_id, client_id, event, channel, metadata)
      SELECT NEW.company_id, NEW.client_id, 'CONVERTED', 'WHATSAPP',
             jsonb_build_object('appointment_id', NEW.id, 'value', NEW.price)
      WHERE EXISTS (
        SELECT 1 FROM public.message_logs ml
        WHERE ml.client_id = NEW.client_id AND ml.company_id = NEW.company_id
          AND ml.event = 'SENT' AND ml.created_at >= now() - interval '30 days'
      );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mie_conversion ON public.appointments;
CREATE TRIGGER trg_mie_conversion AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.mie_handle_conversion();

-- 7. Seed default templates per existing company (only if no template of that type exists)
INSERT INTO public.message_templates (company_id, name, type, channel, body, variables, is_default, active, cadence_offsets, category)
SELECT c.id, 'Retorno padrão', 'RETURN', 'WHATSAPP',
  'Olá {{primeiro_nome}}! Já está chegando o momento ideal para você voltar à {{empresa}}. Clique para escolher seu horário: {{link_agendamento}}',
  ARRAY['primeiro_nome','empresa','link_agendamento'], true, true, ARRAY[-7,-3,0,7], 'retorno'
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.message_templates t WHERE t.company_id = c.id AND t.type = 'RETURN');

INSERT INTO public.message_templates (company_id, name, type, channel, body, variables, is_default, active, cadence_offsets, category)
SELECT c.id, 'Reativação 90 dias', 'REACTIVATION', 'WHATSAPP',
  'Olá {{primeiro_nome}}! Sentimos sua falta na {{empresa}}. Que tal voltar com uma condição especial? {{link_agendamento}}',
  ARRAY['primeiro_nome','empresa','link_agendamento'], true, true, ARRAY[0,7,15], 'reativacao'
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.message_templates t WHERE t.company_id = c.id AND t.type = 'REACTIVATION');
