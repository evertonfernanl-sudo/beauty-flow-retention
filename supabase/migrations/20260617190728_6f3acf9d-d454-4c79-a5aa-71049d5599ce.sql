
-- Slug for companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug text UNIQUE;

CREATE OR REPLACE FUNCTION public.slugify(_input text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT trim(both '-' FROM regexp_replace(
    lower(translate(_input,
      'áàâãäåéèêëíìîïóòôõöúùûüçÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUC')),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- Backfill slugs
DO $$
DECLARE r record; base text; candidate text; n int;
BEGIN
  FOR r IN SELECT id, name FROM public.companies WHERE slug IS NULL LOOP
    base := COALESCE(NULLIF(public.slugify(r.name), ''), 'empresa');
    candidate := base; n := 1;
    WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = candidate) LOOP
      n := n + 1; candidate := base || '-' || n;
    END LOOP;
    UPDATE public.companies SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- Source for appointments
DO $$ BEGIN
  CREATE TYPE public.appointment_source AS ENUM ('ADMIN','ONLINE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS source public.appointment_source NOT NULL DEFAULT 'ADMIN';

-- Public read policies for booking (anon)
GRANT SELECT ON public.companies TO anon;
GRANT SELECT ON public.services TO anon;
GRANT SELECT ON public.professionals TO anon;
GRANT SELECT ON public.appointments TO anon;
GRANT INSERT ON public.appointments TO anon;
GRANT INSERT ON public.clients TO anon;
GRANT SELECT ON public.clients TO anon;

DROP POLICY IF EXISTS "public can view active companies" ON public.companies;
CREATE POLICY "public can view active companies" ON public.companies
  FOR SELECT TO anon USING (active = true AND onboarding_completed = true);

DROP POLICY IF EXISTS "public can view active services" ON public.services;
CREATE POLICY "public can view active services" ON public.services
  FOR SELECT TO anon USING (active = true AND kind = 'SERVICE');

DROP POLICY IF EXISTS "public can view active professionals" ON public.professionals;
CREATE POLICY "public can view active professionals" ON public.professionals
  FOR SELECT TO anon USING (active = true);

-- Anon can read appointment time-slots (only start/end/professional/company exposed via select column grants is hard; we filter via view)
CREATE OR REPLACE VIEW public.v_public_busy_slots
WITH (security_invoker = true) AS
SELECT company_id, professional_id, start_datetime, end_datetime
FROM public.appointments
WHERE status IN ('SCHEDULED','CONFIRMED','COMPLETED');

GRANT SELECT ON public.v_public_busy_slots TO anon, authenticated;

DROP POLICY IF EXISTS "public can read appointment slots" ON public.appointments;
CREATE POLICY "public can read appointment slots" ON public.appointments
  FOR SELECT TO anon USING (status IN ('SCHEDULED','CONFIRMED','COMPLETED'));

DROP POLICY IF EXISTS "public can create online appointments" ON public.appointments;
CREATE POLICY "public can create online appointments" ON public.appointments
  FOR INSERT TO anon WITH CHECK (source = 'ONLINE');

DROP POLICY IF EXISTS "public can create clients via booking" ON public.clients;
CREATE POLICY "public can create clients via booking" ON public.clients
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "public can read clients (booking lookup)" ON public.clients;
CREATE POLICY "public can read clients (booking lookup)" ON public.clients
  FOR SELECT TO anon USING (true);
