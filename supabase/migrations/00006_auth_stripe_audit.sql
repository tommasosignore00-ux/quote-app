-- Auth enhancements: Password reset + Session management
CREATE TABLE public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user ON public.password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires ON public.password_reset_tokens(expires_at);

-- Session management for timeout
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  device_id VARCHAR(255),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON public.user_sessions(session_token);

-- 2FA email codes
CREATE TABLE public.two_factor_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_two_factor_codes_user ON public.two_factor_codes(user_id);

-- Audit logs for compliance
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,          -- 'quote_created', 'document_approved', 'email_sent', etc.
  resource_type VARCHAR(50) NOT NULL,    -- 'lavori', 'clienti', 'preventivi_dettaglio', etc.
  resource_id UUID,
  changes JSONB,                         -- Old vs new values
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- Add missing columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_fa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Add client_country to lavori (for multi-country invoice rendering)
ALTER TABLE public.lavori ADD COLUMN IF NOT EXISTS client_country_code VARCHAR(2);

-- Stripe webhook events log
CREATE TABLE public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,     -- payment_intent.succeeded, invoice.payment_failed, etc.
  user_id UUID REFERENCES auth.users(id),
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stripe_webhook_events_type ON public.stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhook_events_user ON public.stripe_webhook_events(user_id);

-- Enable RLS on new tables
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_factor_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own password reset tokens" ON public.password_reset_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view own sessions" ON public.user_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can delete own sessions" ON public.user_sessions
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can view own 2FA codes" ON public.two_factor_codes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can view audit logs for their resources" ON public.audit_logs
  FOR SELECT USING (
    user_id = auth.uid() OR 
    resource_id IN (
      SELECT id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);
