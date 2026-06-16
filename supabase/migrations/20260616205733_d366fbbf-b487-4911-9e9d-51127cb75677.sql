
CREATE POLICY "company_assets_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = public.get_user_company(auth.uid())::text
  );

CREATE POLICY "company_assets_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = public.get_user_company(auth.uid())::text
  );

CREATE POLICY "company_assets_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = public.get_user_company(auth.uid())::text
  );

CREATE POLICY "company_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = public.get_user_company(auth.uid())::text
    AND public.has_any_role(auth.uid(), public.get_user_company(auth.uid()), 'owner', 'admin')
  );
