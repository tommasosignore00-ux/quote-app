-- Lets the apps show the real renewal state and team-inherited access.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_profile_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.custom_template_html IS DISTINCT FROM OLD.custom_template_html
    OR NEW.subscription_period_end IS DISTINCT FROM OLD.subscription_period_end
    OR NEW.subscription_cancel_at_period_end IS DISTINCT FROM OLD.subscription_cancel_at_period_end
  ) THEN
    RAISE EXCEPTION 'column managed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- For the signed-in user only: the apps use it to show or hide paid features.
CREATE OR REPLACE FUNCTION public.my_entitlement()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.profile_is_entitled(auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.my_entitlement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlement() TO authenticated;
