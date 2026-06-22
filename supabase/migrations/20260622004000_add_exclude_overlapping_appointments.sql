-- Enable btree_gist extension to allow mixing scalar columns (UUID) and range types in exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Clean up any existing overlapping appointments to ensure the constraint can be successfully created
DELETE FROM public.appointments a1
USING public.appointments a2
WHERE a1.company_id = a2.company_id
  AND a1.professional_id = a2.professional_id
  AND a1.status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED')
  AND a2.status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED')
  AND a1.id > a2.id
  AND a1.start_datetime < a2.end_datetime
  AND a1.end_datetime > a2.start_datetime;

-- Add exclusion constraint to prevent overlapping appointments for the same professional
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS exclude_overlapping_appointments;

ALTER TABLE public.appointments
  ADD CONSTRAINT exclude_overlapping_appointments
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(start_datetime, end_datetime) WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED'));

-- Update create_online_booking function to add overlap validation check before insert
CREATE OR REPLACE FUNCTION public.create_online_booking(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_client_name text;
  v_client_phone text;
  v_client_email text;
  v_service_ids uuid[];
  v_professional_id uuid;
  v_start_time timestamptz;
  v_notes text;

  v_client_id uuid;
  v_service_id uuid;
  v_service_price numeric(12,2);
  v_service_duration int;
  v_current_start timestamptz;
  v_current_end timestamptz;
  v_phone_norm text;
  v_created_appointments jsonb := '[]'::jsonb;
  v_appt_id uuid;
  v_service_id_text text;
BEGIN
  -- Unpack JSON parameters
  v_company_id := (p_data->>'p_company_id')::uuid;
  v_client_name := p_data->>'p_client_name';
  v_client_phone := p_data->>'p_client_phone';
  v_client_email := p_data->>'p_client_email';
  v_professional_id := (p_data->>'p_professional_id')::uuid;
  v_start_time := (p_data->>'p_start_time')::timestamptz;
  v_notes := p_data->>'p_notes';

  -- Convert JSON array of strings to UUID array
  IF p_data->'p_service_ids' IS NOT NULL AND jsonb_array_length(p_data->'p_service_ids') > 0 THEN
    FOR v_service_id_text IN SELECT jsonb_array_elements_text(p_data->'p_service_ids') LOOP
      v_service_ids := array_append(v_service_ids, v_service_id_text::uuid);
    END LOOP;
  END IF;

  -- 1) Validate company is bookable
  IF NOT public.is_company_bookable(v_company_id) THEN
    RAISE EXCEPTION 'Empresa não está ativa ou não concluiu a configuração inicial.';
  END IF;

  -- 2) Validate inputs
  IF length(COALESCE(v_client_name, '')) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto.';
  END IF;

  IF length(COALESCE(v_client_phone, '')) < 8 THEN
    RAISE EXCEPTION 'Telefone inválido.';
  END IF;

  IF array_length(v_service_ids, 1) IS NULL OR array_length(v_service_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um serviço.';
  END IF;

  -- Normalize phone
  v_phone_norm := public.normalize_phone(v_client_phone);

  -- 3) Find or create client
  SELECT id INTO v_client_id
    FROM public.clients
   WHERE company_id = v_company_id
     AND (
       phone_api = v_phone_norm
       OR phone = v_client_phone
       OR phone = v_phone_norm
       OR phone_original = v_client_phone
     )
   LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (company_id, name, phone, email, status)
    VALUES (v_company_id, trim(v_client_name), v_client_phone, NULLIF(trim(v_client_email), ''), 'ACTIVE')
    RETURNING id INTO v_client_id;
  ELSE
    -- Update client info if provided (name, email)
    UPDATE public.clients
       SET name = COALESCE(trim(v_client_name), name),
           email = COALESCE(NULLIF(trim(v_client_email), ''), email)
     WHERE id = v_client_id;
  END IF;

  -- 4) Create appointments sequentially
  v_current_start := v_start_time;
  
  FOREACH v_service_id IN ARRAY v_service_ids LOOP
    -- Fetch service details
    SELECT price, duration_minutes INTO v_service_price, v_service_duration
      FROM public.services
     WHERE id = v_service_id AND company_id = v_company_id AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Serviço não encontrado ou inativo.';
    END IF;

    -- Calculate end time
    v_current_end := v_current_start + (v_service_duration * interval '1 minute');

    -- Check if professional is already booked for this slot
    IF v_professional_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.appointments
      WHERE company_id = v_company_id
        AND professional_id = v_professional_id
        AND status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED')
        AND start_datetime < v_current_end
        AND end_datetime > v_current_start
    ) THEN
      RAISE EXCEPTION 'O profissional selecionado já possui um agendamento neste horário.';
    END IF;

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
      v_company_id,
      v_client_id,
      v_service_id,
      v_professional_id,
      v_current_start,
      v_current_end,
      v_service_price,
      'SCHEDULED',
      'ONLINE',
      NULLIF(trim(v_notes), '')
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

REVOKE EXECUTE ON FUNCTION public.create_online_booking(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_online_booking(jsonb) TO anon, authenticated, service_role;
