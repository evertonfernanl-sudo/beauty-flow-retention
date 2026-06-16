
-- =========================================================
-- BeautyFlow — Foundation + Retornos
-- =========================================================

-- Enums
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'employee');
CREATE TYPE public.company_plan AS ENUM ('starter', 'professional', 'premium');
CREATE TYPE public.client_status AS ENUM ('ACTIVE', 'INACTIVE', 'LOST');
CREATE TYPE public.appointment_status AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE public.return_status AS ENUM ('ON_TIME', 'DUE', 'LATE', 'LOST');

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- companies
-- =========================================================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  logo_url TEXT,
  plan public.company_plan NOT NULL DEFAULT 'starter',
  active BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- profiles (one per auth user)
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_company ON public.profiles(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- user_roles (separate table to avoid privilege escalation)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_company ON public.user_roles(company_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Security definer helpers
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_user_company(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _company_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _company_id UUID, VARIADIC _roles public.app_role[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role = ANY(_roles)
  );
$$;

-- =========================================================
-- clients
-- =========================================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  birthday DATE,
  notes TEXT,
  status public.client_status NOT NULL DEFAULT 'ACTIVE',
  last_visit TIMESTAMPTZ,
  next_return DATE,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  appointments_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_company ON public.clients(company_id);
CREATE INDEX idx_clients_next_return ON public.clients(company_id, next_return);
CREATE INDEX idx_clients_status ON public.clients(company_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- services
-- =========================================================
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 60,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  return_days INT NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_services_company ON public.services(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- appointments
-- =========================================================
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'SCHEDULED',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_company ON public.appointments(company_id);
CREATE INDEX idx_appointments_client ON public.appointments(client_id);
CREATE INDEX idx_appointments_service ON public.appointments(service_id);
CREATE INDEX idx_appointments_start ON public.appointments(company_id, start_datetime);
CREATE INDEX idx_appointments_status ON public.appointments(company_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- return_opportunities (CORE module)
-- =========================================================
CREATE TABLE public.return_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  expected_return_date DATE NOT NULL,
  days_late INT NOT NULL DEFAULT 0,
  estimated_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.return_status NOT NULL DEFAULT 'ON_TIME',
  contacted BOOLEAN NOT NULL DEFAULT false,
  contacted_at TIMESTAMPTZ,
  converted BOOLEAN NOT NULL DEFAULT false,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_returns_company ON public.return_opportunities(company_id);
CREATE INDEX idx_returns_client ON public.return_opportunities(client_id);
CREATE INDEX idx_returns_status ON public.return_opportunities(company_id, status);
CREATE INDEX idx_returns_expected ON public.return_opportunities(company_id, expected_return_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_opportunities TO authenticated;
GRANT ALL ON public.return_opportunities TO service_role;
ALTER TABLE public.return_opportunities ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_returns_updated_at BEFORE UPDATE ON public.return_opportunities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- companies
CREATE POLICY "company members view own company"
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.get_user_company(auth.uid()));

CREATE POLICY "owners update own company"
  ON public.companies FOR UPDATE TO authenticated
  USING (id = public.get_user_company(auth.uid()) AND public.has_role(auth.uid(), id, 'owner'))
  WITH CHECK (id = public.get_user_company(auth.uid()) AND public.has_role(auth.uid(), id, 'owner'));

CREATE POLICY "authenticated users create company"
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (true);

-- profiles
CREATE POLICY "users view profiles in own company"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR company_id = public.get_user_company(auth.uid()));

CREATE POLICY "users insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- user_roles
CREATE POLICY "users view roles in own company"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id = public.get_user_company(auth.uid()));

-- (insert/update/delete of roles done via service_role / server functions only)

-- clients
CREATE POLICY "company members view clients"
  ON public.clients FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members insert clients"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members update clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company(auth.uid()))
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "owners and admins delete clients"
  ON public.clients FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  );

-- services
CREATE POLICY "company members view services"
  ON public.services FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "admins manage services insert"
  ON public.services FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  );

CREATE POLICY "admins manage services update"
  ON public.services FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  )
  WITH CHECK (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  );

CREATE POLICY "admins delete services"
  ON public.services FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  );

-- appointments
CREATE POLICY "company members view appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members insert appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members update appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company(auth.uid()))
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "admins delete appointments"
  ON public.appointments FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  );

-- return_opportunities
CREATE POLICY "company members view returns"
  ON public.return_opportunities FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members insert returns"
  ON public.return_opportunities FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "company members update returns"
  ON public.return_opportunities FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company(auth.uid()))
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "admins delete returns"
  ON public.return_opportunities FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company(auth.uid())
    AND public.has_any_role(auth.uid(), company_id, 'owner', 'admin')
  );

-- =========================================================
-- TRIGGER: when appointment is COMPLETED, update client + create return
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_appointment_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_days INT;
  v_service_price NUMERIC(12,2);
  v_expected_date DATE;
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    SELECT return_days, price INTO v_return_days, v_service_price
    FROM public.services WHERE id = NEW.service_id;

    v_expected_date := (NEW.start_datetime::date + COALESCE(v_return_days, 30));

    -- update client metrics
    UPDATE public.clients
    SET last_visit = NEW.start_datetime,
        next_return = v_expected_date,
        total_spent = total_spent + COALESCE(NEW.price, 0),
        appointments_count = appointments_count + 1,
        status = 'ACTIVE'
    WHERE id = NEW.client_id;

    -- mark previous open opportunities as converted
    UPDATE public.return_opportunities
    SET converted = true, converted_at = now(), status = 'ON_TIME'
    WHERE client_id = NEW.client_id AND converted = false;

    -- create next opportunity
    INSERT INTO public.return_opportunities (
      company_id, client_id, service_id,
      expected_return_date, estimated_value, status
    ) VALUES (
      NEW.company_id, NEW.client_id, NEW.service_id,
      v_expected_date, COALESCE(v_service_price, NEW.price, 0), 'ON_TIME'
    );

    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_completed
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.handle_appointment_completed();

-- =========================================================
-- FUNCTION: refresh return opportunity statuses (cron-friendly)
-- =========================================================
CREATE OR REPLACE FUNCTION public.refresh_return_opportunities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.return_opportunities
  SET
    days_late = GREATEST(0, (CURRENT_DATE - expected_return_date)),
    status = CASE
      WHEN converted THEN status
      WHEN CURRENT_DATE < expected_return_date THEN 'ON_TIME'
      WHEN CURRENT_DATE = expected_return_date THEN 'DUE'
      WHEN (CURRENT_DATE - expected_return_date) BETWEEN 1 AND 60 THEN 'LATE'
      ELSE 'LOST'
    END
  WHERE converted = false;

  -- mark clients as LOST if 90+ days without return
  UPDATE public.clients c
  SET status = 'LOST'
  WHERE c.last_visit IS NOT NULL
    AND c.last_visit < (now() - interval '90 days')
    AND c.status <> 'LOST';
END;
$$;
