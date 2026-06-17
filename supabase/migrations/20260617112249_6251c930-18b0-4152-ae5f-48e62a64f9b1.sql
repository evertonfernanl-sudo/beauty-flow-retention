
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS profession TEXT;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Dedupe: keep oldest, null phone on later duplicates
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id, phone ORDER BY created_at) AS rn
  FROM public.clients
  WHERE phone IS NOT NULL AND phone <> ''
)
UPDATE public.clients c SET phone = NULL
FROM ranked r WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS clients_company_phone_unique
  ON public.clients (company_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';

DO $$ BEGIN
  CREATE TYPE public.contact_channel AS ENUM ('WHATSAPP','PHONE','INSTAGRAM','IN_PERSON','EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contact_result AS ENUM ('ANSWERED','NO_ANSWER','SCHEDULED','REFUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID,
  channel public.contact_channel NOT NULL,
  result public.contact_result,
  notes TEXT,
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_contacts_client_idx ON public.client_contacts(client_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS client_contacts_company_idx ON public.client_contacts(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read contacts"
  ON public.client_contacts FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members insert contacts"
  ON public.client_contacts FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members update contacts"
  ON public.client_contacts FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company(auth.uid()))
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members delete contacts"
  ON public.client_contacts FOR DELETE TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));
