-- Durable fixed-window counters: unlike memory they work across serverless instances.

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expiry
  ON public.rate_limit_counters (expires_at);

-- No policies: only the service role and the function below reach this table.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  v_reset TIMESTAMPTZ := v_window + make_interval(secs => p_window_seconds);
  v_hits INTEGER;
BEGIN
  INSERT INTO public.rate_limit_counters AS c (key, window_start, hits, expires_at)
  VALUES (p_key, v_window, 1, v_reset)
  ON CONFLICT (key, window_start)
  DO UPDATE SET hits = c.hits + 1
  RETURNING c.hits INTO v_hits;

  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_counters WHERE expires_at < now();
  END IF;

  RETURN QUERY SELECT v_hits <= p_limit, greatest(0, p_limit - v_hits), v_reset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
