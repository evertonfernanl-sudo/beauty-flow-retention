-- Add permissions JSONB column to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
