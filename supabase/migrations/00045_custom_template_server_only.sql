-- Custom templates are sanitized by the server before saving, so clients cannot
-- write this column directly. Clearing it is still handled by the same endpoint.
CREATE OR REPLACE FUNCTION public.guard_profile_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
    AND NEW.custom_template_html IS DISTINCT FROM OLD.custom_template_html
  THEN
    RAISE EXCEPTION 'templates are saved by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_template ON public.profiles;
CREATE TRIGGER guard_profile_template
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_template();
