REVOKE SELECT ON public.invitations FROM authenticated;
GRANT SELECT (
  id,
  company_id,
  email,
  role,
  status,
  invited_by,
  expires_at,
  accepted_at,
  created_at,
  updated_at
) ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;