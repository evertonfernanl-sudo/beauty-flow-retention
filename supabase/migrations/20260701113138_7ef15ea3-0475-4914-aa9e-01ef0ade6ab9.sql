
ALTER TABLE public.v3_imports
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS charset text,
  ADD COLUMN IF NOT EXISTS final_state text,
  ADD COLUMN IF NOT EXISTS total_rows integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_rows integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_rows integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ocr_confidence numeric;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v3_imports_final_state_chk') THEN
    ALTER TABLE public.v3_imports
      ADD CONSTRAINT v3_imports_final_state_chk
      CHECK (final_state IS NULL OR final_state IN ('SUCCESS','PARTIAL_SUCCESS','REVIEW','FAILED'));
  END IF;
END $$;

ALTER TABLE public.v3_import_rows
  ADD COLUMN IF NOT EXISTS possible_duplicate boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS classification_confidence integer,
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.v3_audit_log
  ADD COLUMN IF NOT EXISTS responsavel text NOT NULL DEFAULT 'Sistema',
  ADD COLUMN IF NOT EXISTS algorithm_version text DEFAULT 'v3.0.0';
