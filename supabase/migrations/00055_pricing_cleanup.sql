-- Pricing cleanup (11/11/2026).
-- Founders are the first 50 paying customers, marked by the Stripe webhook after a paid
-- founder subscription: never at sign-up. Quotes are unlimited, with no per-quote charge.
-- Team includes 5 users counting the owner; extra seats are a Stripe quantity, not metering.
-- Voice dictation gets a monthly cap on top of the daily one.

-- 1. Founders: no more automatic status at sign-up.
DROP TRIGGER IF EXISTS trg_founding_member ON public.profiles;
DROP FUNCTION IF EXISTS public.check_founding_member();

-- Sign-ups marked by the old rule never paid as founders: Stripe had no subscriptions.
UPDATE public.profiles
SET is_founding_member = false,
    founding_member_locked_price = NULL
WHERE is_founding_member = true
  AND NOT (subscription_status = 'active' AND stripe_subscription_id IS NOT NULL);

-- 2. Quotes: counted for statistics only. A new revision of the same job is not a new quote.
UPDATE public.quote_usage SET overage_count = 0 WHERE overage_count <> 0;
ALTER TABLE public.quote_usage ALTER COLUMN quotes_limit SET DEFAULT 500;
UPDATE public.quote_usage SET quotes_limit = 500 WHERE quotes_limit < 500;

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

  -- Only the first sent version of a job counts.
  IF EXISTS (
    SELECT 1 FROM public.preventivi_versioni pv
    WHERE pv.lavoro_id = NEW.lavoro_id
      AND pv.id <> NEW.id
      AND pv.sent_at IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;

  SELECT profile_id INTO v_profile FROM public.lavori WHERE id = NEW.lavoro_id;
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.quote_usage (profile_id, period_start, period_end, quotes_generated)
  VALUES (v_profile, v_period, (v_period + INTERVAL '1 month')::DATE, 1)
  ON CONFLICT (profile_id, period_start) DO UPDATE
    SET quotes_generated = quote_usage.quotes_generated + 1;
  RETURN NULL;
END;
$$;

-- The reader showed 5 as the limit before the first quote of the month.
CREATE OR REPLACE FUNCTION public.get_quote_usage(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.can_act_on_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'quotes_generated', COALESCE(qu.quotes_generated, 0),
    'quotes_limit', NULL,
    'overage_count', 0,
    'within_limit', true,
    'period_start', qu.period_start
  ) INTO result
  FROM quote_usage qu
  WHERE qu.profile_id = p_profile_id
    AND qu.period_start = date_trunc('month', NOW());

  IF result IS NULL THEN
    result := jsonb_build_object(
      'quotes_generated', 0,
      'quotes_limit', NULL,
      'overage_count', 0,
      'within_limit', true,
      'period_start', date_trunc('month', NOW())
    );
  END IF;

  RETURN result;
END;
$$;

-- 3. Team: 5 users including the owner, so the owner's members beyond 4 are extra.
CREATE OR REPLACE FUNCTION public.refresh_extra_team_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID := coalesce(NEW.team_owner_id, OLD.team_owner_id);
BEGIN
  UPDATE public.profiles p
  SET extra_team_members = greatest(0, (
    SELECT count(*) FROM public.team_members tm
    WHERE tm.team_owner_id = v_owner AND tm.active = true AND tm.accepted_at IS NOT NULL
  ) - 4)
  WHERE p.id = v_owner;
  RETURN NULL;
END;
$$;

UPDATE public.profiles p
SET extra_team_members = greatest(0, (
  SELECT count(*) FROM public.team_members tm
  WHERE tm.team_owner_id = p.id AND tm.active = true AND tm.accepted_at IS NOT NULL
) - 4)
WHERE p.team_plan = true;

-- 4. No more monthly metered billing: per-quote charges are gone and seats are a quantity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metered-billing-monthly') THEN
    PERFORM cron.unschedule('metered-billing-monthly');
  END IF;
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  NULL;
END;
$$;

-- 5. AI quota with an optional monthly cap (Europe/Rome calendar month).
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_profile_id UUID,
  p_feature TEXT,
  p_units INTEGER,
  p_daily_limit INTEGER,
  p_monthly_limit INTEGER
)
RETURNS TABLE (allowed BOOLEAN, used INTEGER, limit_reached TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_month_start DATE := date_trunc('month', v_day)::date;
  v_month_used INTEGER;
BEGIN
  IF p_monthly_limit IS NOT NULL THEN
    -- One counter per user and feature: concurrent requests wait for each other here.
    PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text || ':' || p_feature));
    SELECT COALESCE(sum(units), 0) INTO v_month_used FROM public.ai_usage_daily
      WHERE profile_id = p_profile_id AND feature = p_feature AND day >= v_month_start;
    IF v_month_used + p_units > p_monthly_limit THEN
      RETURN QUERY SELECT false, v_month_used, 'monthly'::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT d.allowed, d.used, CASE WHEN d.allowed THEN NULL ELSE 'daily' END
    FROM public.consume_ai_quota(p_profile_id, p_feature, p_units, p_daily_limit) d;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
