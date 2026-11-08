-- One definition of "may use paid features", shared by the web API and Edge Functions.
-- past_due keeps access: Stripe is still retrying the card, and when it gives up the
-- subscription becomes canceled or unpaid, which ends access.

-- Team members existing before the acceptance flow were active without accepted_at.
UPDATE public.team_members
SET accepted_at = coalesce(invited_at, now())
WHERE active = true AND accepted_at IS NULL;

CREATE OR REPLACE FUNCTION public.profile_is_entitled(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id
      AND (p.subscription_status IN ('trialing', 'active', 'past_due') OR p.trial_ends_at > now())
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.profiles owner ON owner.id = tm.team_owner_id
    WHERE tm.member_id = p_profile_id
      AND tm.active = true
      AND tm.accepted_at IS NOT NULL
      AND owner.team_plan = true
      AND (owner.subscription_status IN ('trialing', 'active', 'past_due') OR owner.trial_ends_at > now())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.profile_is_entitled(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_is_entitled(UUID) TO service_role;

-- Quote usage is billed, so it is counted here when a revision is sent.
CREATE OR REPLACE FUNCTION public.count_quote_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile UUID;
  v_period DATE := date_trunc('month', now())::DATE;
BEGIN
  IF NEW.sent_at IS NULL OR (TG_OP = 'UPDATE' AND OLD.sent_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;

  SELECT profile_id INTO v_profile FROM public.lavori WHERE id = NEW.lavoro_id;
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.quote_usage (profile_id, period_start, period_end, quotes_generated)
  VALUES (v_profile, v_period, (v_period + INTERVAL '1 month')::DATE, 1)
  ON CONFLICT (profile_id, period_start) DO UPDATE
    SET quotes_generated = quote_usage.quotes_generated + 1,
        overage_count = greatest(0, quote_usage.quotes_generated + 1 - quote_usage.quotes_limit);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS count_quote_usage ON public.preventivi_versioni;
CREATE TRIGGER count_quote_usage
  AFTER INSERT OR UPDATE OF sent_at ON public.preventivi_versioni
  FOR EACH ROW EXECUTE FUNCTION public.count_quote_usage();

REVOKE EXECUTE ON FUNCTION public.increment_quote_usage(UUID) FROM authenticated;
