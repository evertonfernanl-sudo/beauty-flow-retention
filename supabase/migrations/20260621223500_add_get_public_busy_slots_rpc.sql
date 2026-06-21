-- Create get_public_busy_slots RPC function that runs with SECURITY DEFINER
-- to allow anonymous visitors to retrieve busy slots without direct SELECT permissions on appointments table.
CREATE OR REPLACE FUNCTION public.get_public_busy_slots(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_professional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  start_datetime timestamptz,
  end_datetime timestamptz,
  professional_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.start_datetime, a.end_datetime, a.professional_id
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED')
    AND a.start_datetime >= p_from
    AND a.start_datetime < p_to
    AND (p_professional_id IS NULL OR a.professional_id = p_professional_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_busy_slots(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_busy_slots(uuid, timestamptz, timestamptz, uuid) TO anon, authenticated, service_role;
