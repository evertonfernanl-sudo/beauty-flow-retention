-- Recreate public busy slots view without security_invoker = true
-- This allows anon to query occupied start/end times without having SELECT permission on appointments
DROP VIEW IF EXISTS public.v_public_busy_slots;

CREATE OR REPLACE VIEW public.v_public_busy_slots AS
SELECT company_id, professional_id, start_datetime, end_datetime
FROM public.appointments
WHERE status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED');

GRANT SELECT ON public.v_public_busy_slots TO anon, authenticated;
