-- Create online booking RPC function
CREATE OR REPLACE FUNCTION public.create_online_booking(
  p_company_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_service_ids uuid[],
  p_professional_id uuid,
  p_start_time timestamptz,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_service_id uuid;
  v_service_price numeric(12,2);
  v_service_duration int;
  v_current_start timestamptz;
  v_current_end timestamptz;
  v_phone_norm text;
  v_created_appointments jsonb := '[]'::jsonb;
  v_appt_id uuid;
BEGIN
  -- 1) Validate company is bookable
  IF NOT public.is_company_bookable(p_company_id) THEN
    RAISE EXCEPTION 'Empresa não está ativa ou não concluiu a configuração inicial.';
  END IF;

  -- 2) Validate inputs
  IF length(COALESCE(p_client_name, '')) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto.';
  END IF;

  IF length(COALESCE(p_client_phone, '')) < 8 THEN
    RAISE EXCEPTION 'Telefone inválido.';
  END IF;

  IF array_length(p_service_ids, 1) IS NULL OR array_length(p_service_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um serviço.';
  END IF;

  -- Normalize phone
  v_phone_norm := public.normalize_phone(p_client_phone);

  -- 3) Find or create client
  SELECT id INTO v_client_id
    FROM public.clients
   WHERE company_id = p_company_id
     AND (
       phone_api = v_phone_norm
       OR phone = p_client_phone
       OR phone = v_phone_norm
       OR phone_original = p_client_phone
     )
   LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (company_id, name, phone, email, status)
    VALUES (p_company_id, trim(p_client_name), p_client_phone, NULLIF(trim(p_client_email), ''), 'ACTIVE')
    RETURNING id INTO v_client_id;
  ELSE
    -- Update client info if provided (name, email)
    UPDATE public.clients
       SET name = COALESCE(trim(p_client_name), name),
           email = COALESCE(NULLIF(trim(p_client_email), ''), email)
     WHERE id = v_client_id;
  END IF;

  -- 4) Create appointments sequentially
  v_current_start := p_start_time;
  
  FOREACH v_service_id IN ARRAY p_service_ids LOOP
    -- Fetch service details
    SELECT price, duration_minutes INTO v_service_price, v_service_duration
      FROM public.services
     WHERE id = v_service_id AND company_id = p_company_id AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Serviço não encontrado ou inativo.';
    END IF;

    -- Calculate end time
    v_current_end := v_current_start + (v_service_duration * interval '1 minute');

    -- Insert appointment
    INSERT INTO public.appointments (
      company_id,
      client_id,
      service_id,
      professional_id,
      start_datetime,
      end_datetime,
      price,
      status,
      source,
      notes
    ) VALUES (
      p_company_id,
      v_client_id,
      v_service_id,
      p_professional_id,
      v_current_start,
      v_current_end,
      v_service_price,
      'SCHEDULED',
      'ONLINE',
      NULLIF(trim(p_notes), '')
    )
    RETURNING id INTO v_appt_id;

    -- Append to return array
    v_created_appointments := v_created_appointments || jsonb_build_object(
      'id', v_appt_id,
      'service_id', v_service_id,
      'start', v_current_start,
      'end', v_current_end
    );

    -- Next appointment starts when this one ends
    v_current_start := v_current_end;
  END LOOP;

  RETURN jsonb_build_object(
    'client_id', v_client_id,
    'appointments', v_created_appointments
  );
END;
$$;

-- Revoke from public, grant to specific roles
REVOKE EXECUTE ON FUNCTION public.create_online_booking(uuid, text, text, text, uuid[], uuid, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_online_booking(uuid, text, text, text, uuid[], uuid, timestamptz, text) TO anon, authenticated, service_role;
