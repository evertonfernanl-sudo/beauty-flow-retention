-- Generic audit trigger: capture INSERT/UPDATE/DELETE on sensitive tables.
CREATE OR REPLACE FUNCTION public.fn_audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_user UUID := auth.uid();
  v_entity_id UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_company := (OLD).company_id;
    v_entity_id := (OLD).id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_company := (NEW).company_id;
    v_entity_id := (NEW).id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSE
    v_company := (NEW).company_id;
    v_entity_id := (NEW).id;
    v_old := NULL;
    v_new := to_jsonb(NEW);
  END IF;

  -- only log if we have a company and a user (skip system writes from triggers)
  IF v_company IS NOT NULL AND v_user IS NOT NULL THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity, entity_id, old_data, new_data)
    VALUES (v_company, v_user, lower(TG_OP), TG_TABLE_NAME, v_entity_id, v_old, v_new);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Attach to sensitive tables (drop & recreate to be idempotent).
DROP TRIGGER IF EXISTS trg_audit_clients ON public.clients;
CREATE TRIGGER trg_audit_clients
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_appointments ON public.appointments;
CREATE TRIGGER trg_audit_appointments
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_financial ON public.financial_transactions;
CREATE TRIGGER trg_audit_financial
AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_services ON public.services;
CREATE TRIGGER trg_audit_services
AFTER INSERT OR UPDATE OR DELETE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();