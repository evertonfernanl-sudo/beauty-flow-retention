ALTER TABLE public.v3_import_rows DROP CONSTRAINT IF EXISTS v3_import_rows_status_check;
ALTER TABLE public.v3_import_rows ADD CONSTRAINT v3_import_rows_status_check CHECK (status IN ('OK','LINE_FAILED','LINE_REVIEW','applied','skipped'));
