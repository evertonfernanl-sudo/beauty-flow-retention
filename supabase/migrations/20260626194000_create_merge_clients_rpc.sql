-- Create PostgreSQL function to merge duplicate clients
CREATE OR REPLACE FUNCTION public.merge_clients(source_id UUID, target_id UUID)
RETURNS VOID AS $$
DECLARE
  v_company_id UUID;
  v_source_company_id UUID;
  v_target_company_id UUID;
BEGIN
  -- Get user's company_id
  v_company_id := public.get_user_company(auth.uid());
  
  -- Get companies of both clients
  SELECT company_id INTO v_source_company_id FROM public.clients WHERE id = source_id;
  SELECT company_id INTO v_target_company_id FROM public.clients WHERE id = target_id;
  
  -- Validate same company
  IF v_source_company_id IS NULL OR v_target_company_id IS NULL THEN
    RAISE EXCEPTION 'Um ou ambos os clientes não foram encontrados.';
  END IF;
  
  IF v_source_company_id <> v_company_id OR v_target_company_id <> v_company_id THEN
    RAISE EXCEPTION 'Acesso negado: os clientes devem pertencer à mesma empresa do usuário.';
  END IF;

  -- Update appointments
  UPDATE public.appointments
  SET client_id = target_id
  WHERE client_id = source_id;

  -- Update message_logs
  UPDATE public.message_logs
  SET client_id = target_id
  WHERE client_id = source_id;

  -- Update message_queue
  UPDATE public.message_queue
  SET client_id = target_id
  WHERE client_id = source_id;

  -- Update recovery_opportunities
  UPDATE public.recovery_opportunities
  SET client_id = target_id
  WHERE client_id = source_id;

  -- Update import_rows
  UPDATE public.import_rows
  SET resolved_client_id = target_id
  WHERE resolved_client_id = source_id;

  -- Update providers
  UPDATE public.providers
  SET client_id = target_id
  WHERE client_id = source_id;

  -- Delete the duplicate source client
  DELETE FROM public.clients
  WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
