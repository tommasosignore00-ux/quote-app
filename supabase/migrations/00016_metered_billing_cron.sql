-- Migration: Schedule metered billing cron job (Punto 14)
-- Runs on the 1st of every month at 03:00 UTC to report previous month's overage to Stripe

-- Enable pg_cron and pg_net extensions (pg_cron is already available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the metered-billing Edge Function to run monthly
SELECT cron.schedule(
  'metered-billing-monthly',
  '0 3 1 * *',  -- At 03:00 UTC on the 1st of every month
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/metered-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
