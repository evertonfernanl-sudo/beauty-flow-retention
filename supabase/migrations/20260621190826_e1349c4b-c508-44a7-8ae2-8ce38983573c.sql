ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone2 text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;