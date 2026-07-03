CREATE TABLE IF NOT EXISTS public.v3_ocr_cache (
  file_hash text PRIMARY KEY,
  ocr_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS e permissões básicas
ALTER TABLE public.v3_ocr_cache ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'v3_ocr_cache' AND policyname = 'v3_ocr_cache_policy_all'
  ) THEN
    CREATE POLICY v3_ocr_cache_policy_all ON public.v3_ocr_cache
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.v3_ocr_cache TO authenticated;
GRANT ALL ON public.v3_ocr_cache TO service_role;
