-- Add client_id column to providers table linking to clients
ALTER TABLE public.providers ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
