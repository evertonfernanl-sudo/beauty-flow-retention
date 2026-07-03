ALTER TABLE public.v3_import_rows DROP CONSTRAINT IF EXISTS v3_import_rows_status_check;
ALTER TABLE public.v3_import_rows ADD CONSTRAINT v3_import_rows_status_check CHECK (status IN ('OK','LINE_FAILED','LINE_REVIEW','applied'));

ALTER TABLE public.v3_imports DROP CONSTRAINT IF EXISTS v3_imports_final_state_check;
ALTER TABLE public.v3_imports ADD CONSTRAINT v3_imports_final_state_check CHECK (final_state IS NULL OR final_state IN ('SUCCESS','PARTIAL_SUCCESS','REVIEW','FAILED'));