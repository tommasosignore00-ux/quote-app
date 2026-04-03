-- Migration: Outbound webhooks system
-- Punto 43: Webhook Outbound - send data to Zapier/Make when a quote is approved.

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,                          -- HMAC signing secret
  events TEXT[] NOT NULL DEFAULT '{}',  -- Array of event types to listen for
  active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_endpoints_profile ON webhook_endpoints(profile_id);

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own webhooks"
  ON webhook_endpoints FOR ALL
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhook_endpoints(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  delivered_at TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN DEFAULT false,
  retries INTEGER DEFAULT 0
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event_type);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (
    webhook_id IN (
      SELECT id FROM webhook_endpoints WHERE profile_id = auth.uid()
    )
  );
