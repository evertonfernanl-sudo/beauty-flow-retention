
-- 1. Fix RLS policy always true (companies INSERT)
DROP POLICY IF EXISTS "authenticated users create company" ON public.companies;
CREATE POLICY "authenticated users create company"
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_company(auth.uid()) IS NULL);

-- 2. Harden integrations.config column-level access (defense in depth).
-- Owner/admin keep full access via existing FOR ALL policy. Revoke column
-- privileges so employees cannot read the secret config even if a broader
-- SELECT policy is added later.
REVOKE ALL ON TABLE public.integrations FROM anon;
REVOKE ALL (config) ON public.integrations FROM authenticated;
GRANT SELECT (id, company_id, provider, status, created_at, updated_at)
  ON public.integrations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.integrations TO authenticated;

-- 3. Revoke EXECUTE on internal SECURITY DEFINER functions that should not be
-- callable via the API (triggers and background workers).
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_audit_row()',
    'public.fn_clients_normalize()',
    'public.handle_appointment_completed()',
    'public.handle_appointment_income()',
    'public.handle_company_trial()',
    'public.handle_recovery_conversion()',
    'public.guard_company_billing_fields()',
    'public.guard_profile_immutable_fields()',
    'public.set_updated_at()',
    'public.mie_handle_conversion()',
    'public.finish_job(uuid, boolean, jsonb, text)',
    'public.claim_next_job()',
    'public.refresh_client_behavior_profile(uuid)',
    'public.refresh_recovery_opportunities(uuid)',
    'public.refresh_return_opportunities()'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Also revoke anon EXECUTE on definer RPCs that require an authenticated session
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.assign_user_role(uuid, uuid, app_role)',
    'public.revoke_user_role(uuid, uuid, app_role)',
    'public.enqueue_job(uuid, text, jsonb, integer, timestamptz)',
    'public.find_duplicate_client(uuid, text, text, real)',
    'public.merge_clients(uuid, uuid)',
    'public.mie_enqueue_from_opportunities(uuid)',
    'public.mie_render_template(text, uuid)',
    'public.learn_pattern(uuid, import_pattern_type, text, text, uuid, text, integer)',
    'public.predict_offering_from_amount(uuid, numeric)',
    'public.calc_recovery_score(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;
END $$;
