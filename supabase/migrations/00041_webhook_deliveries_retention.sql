-- I payload dei webhook contengono dati di clienti: dopo 30 giorni resta solo l'esito.
CREATE OR REPLACE FUNCTION public.purge_webhook_delivery_payloads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- TODO(legale): periodo PROVVISORIO, da confermare con il legale.
  keep_payload_for CONSTANT INTERVAL := INTERVAL '30 days';
BEGIN
  UPDATE public.webhook_deliveries
    SET payload = '{}'::jsonb, response_body = NULL
    WHERE delivered_at < now() - keep_payload_for
      AND (payload <> '{}'::jsonb OR response_body IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_webhook_delivery_payloads() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'purge-webhook-delivery-payloads',
  '30 3 * * *',
  $$ SELECT public.purge_webhook_delivery_payloads(); $$
);
