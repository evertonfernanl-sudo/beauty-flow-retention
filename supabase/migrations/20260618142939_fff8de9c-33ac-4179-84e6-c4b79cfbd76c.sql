DROP POLICY IF EXISTS "company members update clients" ON public.clients;
CREATE POLICY "owners and admins update clients" ON public.clients
FOR UPDATE TO authenticated
USING (company_id = public.get_user_company(auth.uid()) AND public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner'::app_role,'admin'::app_role]))
WITH CHECK (company_id = public.get_user_company(auth.uid()) AND public.has_any_role(auth.uid(), company_id, VARIADIC ARRAY['owner'::app_role,'admin'::app_role]));