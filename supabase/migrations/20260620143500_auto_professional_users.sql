-- 1) Backfill existing users in user_roles into professionals if they don't exist
INSERT INTO public.professionals (company_id, user_id, name, email, active)
SELECT ur.company_id, ur.user_id, p.name, p.email, true
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
LEFT JOIN public.professionals pr ON pr.user_id = ur.user_id
WHERE pr.id IS NULL;

-- 2) Create the function to auto-create professional records for new user roles
CREATE OR REPLACE FUNCTION public.handle_user_role_professional()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE user_id = NEW.user_id) THEN
    INSERT INTO public.professionals (company_id, user_id, name, email, active)
    SELECT NEW.company_id, NEW.user_id, p.name, p.email, true
    FROM public.profiles p
    WHERE p.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Create the trigger on user_roles
CREATE OR REPLACE TRIGGER trg_user_role_professional
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_role_professional();
