-- Run only against a reviewed database after the preceding schema migrations.
-- Prevent authenticated users from assigning or changing their own role via direct SDK calls.
CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  IF TG_OP = 'INSERT' AND NEW.role <> 'student' THEN
   RAISE EXCEPTION 'Teacher role assignment requires a trusted administrator';
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
   RAISE EXCEPTION 'Role changes require a trusted administrator';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_profile_role_change ON public.profiles;
CREATE TRIGGER guard_profile_role_change BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();
