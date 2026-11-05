-- Tetto giornaliero di utilizzo AI per utente (costi OpenAI sotto controllo).
-- Un contatore per utente, giorno e funzione; consume_ai_quota incrementa in modo
-- atomico solo se il limite non viene superato.

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
  feature TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, day, feature)
);

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_daily_read_own" ON public.ai_usage_daily;
CREATE POLICY "ai_usage_daily_read_own"
  ON public.ai_usage_daily
  FOR SELECT
  USING (auth.uid() = profile_id);

CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_profile_id UUID,
  p_feature TEXT,
  p_units INTEGER,
  p_daily_limit INTEGER
)
RETURNS TABLE (allowed BOOLEAN, used INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_units INTEGER;
BEGIN
  IF p_units > p_daily_limit THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  INSERT INTO public.ai_usage_daily AS u (profile_id, day, feature, units)
  VALUES (p_profile_id, v_day, p_feature, p_units)
  ON CONFLICT (profile_id, day, feature)
  DO UPDATE SET units = u.units + EXCLUDED.units, updated_at = now()
  WHERE u.units + EXCLUDED.units <= p_daily_limit
  RETURNING u.units INTO v_units;

  IF v_units IS NULL THEN
    -- Limit reached: nothing consumed.
    SELECT units INTO v_units FROM public.ai_usage_daily
      WHERE profile_id = p_profile_id AND day = v_day AND feature = p_feature;
    RETURN QUERY SELECT false, COALESCE(v_units, 0);
  ELSE
    RETURN QUERY SELECT true, v_units;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, INTEGER, INTEGER) TO service_role;
