CREATE OR REPLACE FUNCTION public.handle_company_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base text;
  candidate text;
  n int;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := COALESCE(NULLIF(public.slugify(NEW.name), ''), 'empresa');
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_slug ON public.companies;
CREATE TRIGGER trg_companies_slug
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.handle_company_slug();
