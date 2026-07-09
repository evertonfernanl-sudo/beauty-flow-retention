
ALTER TABLE public.v3_imports
  ADD COLUMN IF NOT EXISTS saldo_inicial numeric,
  ADD COLUMN IF NOT EXISTS saldo_final numeric,
  ADD COLUMN IF NOT EXISTS total_entradas_extrato numeric,
  ADD COLUMN IF NOT EXISTS total_saidas_extrato numeric,
  ADD COLUMN IF NOT EXISTS balance_valid boolean,
  ADD COLUMN IF NOT EXISTS balance_delta numeric,
  ADD COLUMN IF NOT EXISTS very_low_confidence_count int DEFAULT 0;
