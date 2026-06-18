DROP POLICY IF EXISTS "public can view active professionals (safe cols)" ON public.professionals;
CREATE POLICY "public can view active professionals (safe cols)"
ON public.professionals FOR SELECT TO anon
USING (active = true AND public.is_company_bookable(company_id));

DROP POLICY IF EXISTS "public can view active services" ON public.services;
CREATE POLICY "public can view active services"
ON public.services FOR SELECT TO anon
USING (active = true AND kind = 'SERVICE'::offering_kind AND public.is_company_bookable(company_id));