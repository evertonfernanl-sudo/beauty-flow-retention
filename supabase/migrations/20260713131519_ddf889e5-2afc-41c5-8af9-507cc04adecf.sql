
-- Hide invitation tokens from authenticated API access via column-level privileges.
-- Owners/admins still manage invites but cannot read the raw token through PostgREST.
REVOKE SELECT ON public.invitations FROM authenticated;
GRANT SELECT (id, company_id, email, role, status, invited_by, expires_at, accepted_at, created_at, updated_at)
  ON public.invitations TO authenticated;
-- INSERT/UPDATE still permitted for admins under RLS; token is filled by DEFAULT
GRANT INSERT, UPDATE, DELETE ON public.invitations TO authenticated;

-- Provide a SECURITY DEFINER RPC to accept an invitation by raw token.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitations;
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.invitations
   WHERE token = _token
     AND status = 'PENDING'
     AND expires_at > now()
   LIMIT 1;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invitation not found or expired';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR lower(v_email) <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'invitation email does not match authenticated user';
  END IF;

  INSERT INTO public.user_roles(user_id, company_id, role)
  VALUES (v_uid, v_inv.company_id, v_inv.role)
  ON CONFLICT (user_id, company_id, role) DO NOTHING;

  UPDATE public.invitations
     SET status = 'ACCEPTED', accepted_at = now()
   WHERE id = v_inv.id;

  RETURN v_inv.company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
