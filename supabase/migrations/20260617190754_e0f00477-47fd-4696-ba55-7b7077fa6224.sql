
DROP POLICY IF EXISTS "public can read clients (booking lookup)" ON public.clients;
REVOKE SELECT ON public.clients FROM anon;

DROP POLICY IF EXISTS "public can create clients via booking" ON public.clients;
CREATE POLICY "public can create clients via booking" ON public.clients
  FOR INSERT TO anon
  WITH CHECK (
    length(coalesce(name,'')) >= 2
    AND length(coalesce(phone,'')) >= 8
    AND company_id IS NOT NULL
  );
