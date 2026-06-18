
CREATE POLICY "imports_bucket_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'imports'
  AND public.has_any_role(auth.uid(), (split_part(name,'/',1))::uuid,
    'owner'::app_role,'admin'::app_role,'employee'::app_role)
);
CREATE POLICY "imports_bucket_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'imports'
  AND public.has_any_role(auth.uid(), (split_part(name,'/',1))::uuid,
    'owner'::app_role,'admin'::app_role,'employee'::app_role)
);
CREATE POLICY "imports_bucket_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'imports'
  AND public.has_any_role(auth.uid(), (split_part(name,'/',1))::uuid,
    'owner'::app_role,'admin'::app_role)
);
