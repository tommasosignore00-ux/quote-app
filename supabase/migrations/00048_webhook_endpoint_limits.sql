-- Webhook targets must be HTTPS. NOT VALID keeps old rows readable; the dispatcher
-- refuses them anyway. Each account can register a limited number of endpoints.

ALTER TABLE public.webhook_endpoints
  DROP CONSTRAINT IF EXISTS webhook_endpoints_url_https;
ALTER TABLE public.webhook_endpoints
  ADD CONSTRAINT webhook_endpoints_url_https
  CHECK (url ~* '^https://[^/:]+(:443)?(/.*)?$' AND length(url) <= 2048) NOT VALID;

CREATE OR REPLACE FUNCTION public.limit_webhook_endpoints()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.webhook_endpoints WHERE profile_id = NEW.profile_id) >= 5 THEN
    RAISE EXCEPTION 'webhook endpoint limit reached' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS limit_webhook_endpoints ON public.webhook_endpoints;
CREATE TRIGGER limit_webhook_endpoints
  BEFORE INSERT ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.limit_webhook_endpoints();
