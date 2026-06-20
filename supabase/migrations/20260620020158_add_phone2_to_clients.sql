-- Adicionar coluna phone2 na tabela clients e client_phone2 na tabela import_rows
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone2 TEXT;

ALTER TABLE public.import_rows
  ADD COLUMN IF NOT EXISTS client_phone2 TEXT;
