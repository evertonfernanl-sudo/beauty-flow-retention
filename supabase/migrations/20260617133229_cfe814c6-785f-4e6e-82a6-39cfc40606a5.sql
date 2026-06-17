
-- Lock subscriptions to server-side only for writes (billing must come from a verified server flow)
DROP POLICY IF EXISTS "subs owner manage" ON public.subscriptions;
-- SELECT for company members already exists ("subs select own company"); keep it.
-- No INSERT/UPDATE/DELETE policies => only service_role (which bypasses RLS) can mutate.

-- Guard companies.plan against client-side changes; only service_role bypasses RLS triggers run regardless,
-- so allow change only when current role is service_role.
CREATE OR REPLACE FUNCTION public.guard_company_billing_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'companies.plan can only be changed by the billing system';
  END IF;
  IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
    RAISE EXCEPTION 'companies.trial_ends_at can only be changed by the billing system';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_company_billing_fields ON public.companies;
CREATE TRIGGER trg_guard_company_billing_fields
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_billing_fields();

REVOKE EXECUTE ON FUNCTION public.guard_company_billing_fields() FROM PUBLIC, anon, authenticated;
