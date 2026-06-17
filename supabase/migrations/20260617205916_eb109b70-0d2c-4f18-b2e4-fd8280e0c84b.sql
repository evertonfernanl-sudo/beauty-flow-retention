CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_original TEXT,
  ADD COLUMN IF NOT EXISTS phone_api TEXT,
  ADD COLUMN IF NOT EXISTS normalized_name TEXT;

CREATE OR REPLACE FUNCTION public.normalize_phone(_phone TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d TEXT;
BEGIN
  IF _phone IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(_phone, '\D', '', 'g');
  IF length(d) = 0 THEN RETURN NULL; END IF;
  IF left(d, 2) = '55' AND length(d) IN (12, 13) THEN RETURN d; END IF;
  IF length(d) IN (10, 11) THEN RETURN '55' || d; END IF;
  RETURN d;
END; $$;

CREATE OR REPLACE FUNCTION public.normalize_name(_name TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE s TEXT;
BEGIN
  IF _name IS NULL THEN RETURN NULL; END IF;
  s := upper(translate(_name,
    'áàâãäåéèêëíìîïóòôõöúùûüçÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'AAAAAAEEEEIIIIOOOOOUUUUCAAAAAAEEEEIIIIOOOOOUUUUC'));
  s := regexp_replace(s, '[^A-Z0-9 ]', ' ', 'g');
  s := regexp_replace(s, '\s+\m(DA|DE|DO|DAS|DOS|E)\M\s+', ' ', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  RETURN btrim(s);
END; $$;

CREATE OR REPLACE FUNCTION public.fn_clients_normalize()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    IF NEW.phone_original IS NULL OR NEW.phone_original = '' THEN
      NEW.phone_original := NEW.phone;
    END IF;
    NEW.phone_api := public.normalize_phone(NEW.phone);
  ELSE
    NEW.phone_api := NULL;
  END IF;
  IF NEW.name IS NOT NULL THEN
    NEW.normalized_name := public.normalize_name(NEW.name);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_clients_normalize_ins ON public.clients;
DROP TRIGGER IF EXISTS trg_clients_normalize_upd ON public.clients;
CREATE TRIGGER trg_clients_normalize_ins BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.fn_clients_normalize();
CREATE TRIGGER trg_clients_normalize_upd BEFORE UPDATE OF name, phone ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.fn_clients_normalize();

-- Backfill
UPDATE public.clients
SET phone_original = COALESCE(phone_original, phone),
    phone_api = public.normalize_phone(phone),
    normalized_name = public.normalize_name(name);

-- Merge duplicatas: para cada (company_id, phone_api), manter o mais antigo (canonical)
-- e repointar FKs dos demais para ele, depois deletar.
DO $$
DECLARE
  r RECORD;
  v_canonical UUID;
BEGIN
  FOR r IN
    SELECT company_id, phone_api
    FROM public.clients
    WHERE phone_api IS NOT NULL
    GROUP BY company_id, phone_api
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO v_canonical
    FROM public.clients
    WHERE company_id = r.company_id AND phone_api = r.phone_api
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Repointar referências
    UPDATE public.appointments
      SET client_id = v_canonical
      WHERE client_id IN (
        SELECT id FROM public.clients
        WHERE company_id = r.company_id AND phone_api = r.phone_api AND id <> v_canonical
      );
    UPDATE public.return_opportunities
      SET client_id = v_canonical
      WHERE client_id IN (
        SELECT id FROM public.clients
        WHERE company_id = r.company_id AND phone_api = r.phone_api AND id <> v_canonical
      );
    UPDATE public.recovery_opportunities
      SET client_id = v_canonical
      WHERE client_id IN (
        SELECT id FROM public.clients
        WHERE company_id = r.company_id AND phone_api = r.phone_api AND id <> v_canonical
      );
    UPDATE public.recovery_tasks
      SET client_id = v_canonical
      WHERE client_id IN (
        SELECT id FROM public.clients
        WHERE company_id = r.company_id AND phone_api = r.phone_api AND id <> v_canonical
      );
    UPDATE public.client_contacts
      SET client_id = v_canonical
      WHERE client_id IN (
        SELECT id FROM public.clients
        WHERE company_id = r.company_id AND phone_api = r.phone_api AND id <> v_canonical
      );

    -- Atualizar métricas agregadas no canonical
    UPDATE public.clients c
    SET total_spent = (SELECT COALESCE(SUM(price),0) FROM public.appointments WHERE client_id = v_canonical AND status = 'COMPLETED'),
        appointments_count = (SELECT COUNT(*) FROM public.appointments WHERE client_id = v_canonical AND status = 'COMPLETED')
    WHERE c.id = v_canonical;

    -- Deletar duplicatas
    DELETE FROM public.clients
    WHERE company_id = r.company_id AND phone_api = r.phone_api AND id <> v_canonical;
  END LOOP;
END $$;

-- Possíveis duplicatas em recovery_opportunities (constraint client_id+expected_return_date)
-- A constraint pode ter sido violada pelo merge — limpar duplicatas remanescentes
DELETE FROM public.recovery_opportunities a
USING public.recovery_opportunities b
WHERE a.ctid < b.ctid
  AND a.client_id = b.client_id
  AND a.expected_return_date = b.expected_return_date
  AND a.company_id = b.company_id;

DELETE FROM public.return_opportunities a
USING public.return_opportunities b
WHERE a.ctid < b.ctid
  AND a.client_id = b.client_id
  AND a.expected_return_date = b.expected_return_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_api_company
  ON public.clients(company_id, phone_api)
  WHERE phone_api IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_normalized_name_trgm
  ON public.clients USING gin (normalized_name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.find_duplicate_client(
  _company_id UUID, _name TEXT, _phone TEXT, _threshold REAL DEFAULT 0.7
)
RETURNS TABLE (id UUID, name TEXT, phone TEXT, confidence INT, reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone_api TEXT := public.normalize_phone(_phone);
  v_norm_name TEXT := public.normalize_name(_name);
BEGIN
  IF v_phone_api IS NOT NULL THEN
    RETURN QUERY
      SELECT c.id, c.name, c.phone, 100, 'phone'::TEXT
      FROM public.clients c
      WHERE c.company_id = _company_id AND c.phone_api = v_phone_api
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF v_norm_name IS NOT NULL AND length(v_norm_name) >= 3 THEN
    RETURN QUERY
      SELECT c.id, c.name, c.phone,
             (similarity(c.normalized_name, v_norm_name) * 100)::INT,
             'name'::TEXT
      FROM public.clients c
      WHERE c.company_id = _company_id
        AND c.normalized_name % v_norm_name
        AND similarity(c.normalized_name, v_norm_name) >= _threshold
      ORDER BY similarity(c.normalized_name, v_norm_name) DESC
      LIMIT 1;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_client(UUID, TEXT, TEXT, REAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.normalize_name(TEXT) TO authenticated, anon;