-- Update trigger to run on both INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_companies_slug ON public.companies;
CREATE TRIGGER trg_companies_slug
  BEFORE INSERT OR UPDATE
  ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_company_slug();

-- Backfill slugs for any existing companies that have null or empty slugs
UPDATE public.companies
   SET slug = COALESCE(NULLIF(public.slugify(name), ''), 'empresa')
 WHERE slug IS NULL OR slug = '';

-- Resolve any potential duplicates that might have bypassed handle_company_slug
DO $$
DECLARE
  r record;
  v_candidate text;
  v_n int;
BEGIN
  FOR r IN 
    SELECT id, name, slug, ROW_NUMBER() OVER(PARTITION BY slug ORDER BY created_at) as rn 
      FROM public.companies 
     WHERE slug IS NOT NULL AND slug <> ''
  LOOP
    IF r.rn > 1 THEN
      v_n := r.rn;
      v_candidate := r.slug || '-' || v_n;
      WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = v_candidate AND id <> r.id) LOOP
        v_n := v_n + 1;
        v_candidate := r.slug || '-' || v_n;
      END LOOP;
      UPDATE public.companies SET slug = v_candidate WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
