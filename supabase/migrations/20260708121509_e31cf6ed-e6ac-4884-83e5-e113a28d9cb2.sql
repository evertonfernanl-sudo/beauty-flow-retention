
ALTER TABLE public.v3_import_rows
  ADD COLUMN IF NOT EXISTS rule_applied text,
  ADD COLUMN IF NOT EXISTS confidence_level text
    CHECK (confidence_level IS NULL OR confidence_level IN ('MUITO_ALTA','ALTA','MEDIA','BAIXA','MUITO_BAIXA'));

ALTER TABLE public.v3_imports
  ADD COLUMN IF NOT EXISTS homologation_status text
    CHECK (homologation_status IS NULL OR homologation_status IN ('APROVADA','APROVADA_COM_ALERTAS','PENDENTE','REJEITADA')),
  ADD COLUMN IF NOT EXISTS ntieb_version text DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS processing_ms int,
  ADD COLUMN IF NOT EXISTS income_count int,
  ADD COLUMN IF NOT EXISTS expense_count int;
