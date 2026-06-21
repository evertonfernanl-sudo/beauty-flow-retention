-- Fix any null or empty slugs by triggering the BEFORE INSERT OR UPDATE trigger 'trg_companies_slug'
UPDATE public.companies
   SET updated_at = now()
 WHERE slug IS NULL OR slug = '';
