-- Stripe retries and can deliver concurrently: an event is claimed before processing
-- and can be claimed again only if a previous attempt failed or stalled.

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_created_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload JSONB,
  p_event_created_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed INTEGER;
BEGIN
  INSERT INTO public.stripe_webhook_events AS e
    (stripe_event_id, event_type, payload, claimed_at, event_created_at)
  VALUES (p_event_id, p_event_type, p_payload, now(), p_event_created_at)
  ON CONFLICT (stripe_event_id) DO UPDATE
    SET claimed_at = now(), error_message = NULL
    WHERE e.processed_at IS NULL
      AND (e.error_message IS NOT NULL OR e.claimed_at IS NULL OR e.claimed_at < now() - INTERVAL '5 minutes');
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB, TIMESTAMPTZ) TO service_role;
