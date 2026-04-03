-- Migration: Metered billing, team roles, time savings, affiliate, cross-selling
-- Multiple feature points consolidated.

-- ═══════════════════════════════════════════════════
-- Punto 33: Metered Billing - track quote usage per billing period
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quote_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  quotes_generated INTEGER DEFAULT 0,
  quotes_limit INTEGER DEFAULT 50,     -- Base plan limit
  overage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, period_start)
);

CREATE INDEX idx_quote_usage_profile ON quote_usage(profile_id);
ALTER TABLE quote_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON quote_usage FOR SELECT
  USING (auth.uid() = profile_id);

-- Function to increment quote counter
CREATE OR REPLACE FUNCTION increment_quote_usage(p_profile_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_period_start DATE;
  v_usage RECORD;
  v_result JSONB;
BEGIN
  v_period_start := date_trunc('month', now())::DATE;

  INSERT INTO quote_usage (profile_id, period_start, period_end, quotes_generated)
  VALUES (p_profile_id, v_period_start, (v_period_start + INTERVAL '1 month')::DATE, 1)
  ON CONFLICT (profile_id, period_start) DO UPDATE
    SET quotes_generated = quote_usage.quotes_generated + 1,
        overage_count = GREATEST(0, quote_usage.quotes_generated + 1 - quote_usage.quotes_limit);

  SELECT * INTO v_usage FROM quote_usage
  WHERE profile_id = p_profile_id AND period_start = v_period_start;

  v_result := jsonb_build_object(
    'quotes_generated', v_usage.quotes_generated,
    'quotes_limit', v_usage.quotes_limit,
    'overage', v_usage.overage_count,
    'within_limit', v_usage.quotes_generated <= v_usage.quotes_limit
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════
-- Punto 41: Multi-utenza Gerarchica - team roles
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,  -- The paying owner
  member_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'technician', 'readonly')),
  permissions JSONB DEFAULT '{"can_create_quotes": true, "can_edit_quotes": false, "can_manage_clients": false, "can_manage_listini": false, "can_view_reports": false}'::jsonb,
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  UNIQUE(team_owner_id, member_id)
);

CREATE INDEX idx_team_members_owner ON team_members(team_owner_id);
CREATE INDEX idx_team_members_member ON team_members(member_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team owners can manage members"
  ON team_members FOR ALL
  USING (auth.uid() = team_owner_id)
  WITH CHECK (auth.uid() = team_owner_id);

CREATE POLICY "Members can view their membership"
  ON team_members FOR SELECT
  USING (auth.uid() = member_id);

-- ═══════════════════════════════════════════════════
-- Punto 44: Dashboard Risparmio Tempo - server-side tracking
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS time_savings_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  minutes_saved NUMERIC(6,1) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_time_savings_profile ON time_savings_log(profile_id);
CREATE INDEX idx_time_savings_created ON time_savings_log(created_at);

ALTER TABLE time_savings_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own time savings"
  ON time_savings_log FOR ALL
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- ═══════════════════════════════════════════════════
-- Punto 35: Affiliate Program - referral tracking
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  referred_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'registered', 'subscribed', 'paid')),
  commission_percent NUMERIC(5,2) DEFAULT 20.00, -- 20% commission
  commission_amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  converted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);

CREATE INDEX idx_affiliate_referrer ON affiliate_referrals(referrer_id);
CREATE INDEX idx_affiliate_code ON affiliate_referrals(referral_code);

ALTER TABLE affiliate_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referrals"
  ON affiliate_referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- ═══════════════════════════════════════════════════
-- Punto 13: Cross-Selling AI - product suggestions log
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cross_sell_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL = global rules
  trigger_keyword TEXT NOT NULL,
  suggested_keywords TEXT[] NOT NULL,
  active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cross_sell_profile ON cross_sell_rules(profile_id);
CREATE INDEX idx_cross_sell_keyword ON cross_sell_rules(trigger_keyword);

ALTER TABLE cross_sell_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own cross-sell rules"
  ON cross_sell_rules FOR ALL
  USING (auth.uid() = profile_id OR profile_id IS NULL)
  WITH CHECK (auth.uid() = profile_id);

-- ═══════════════════════════════════════════════════
-- Punto 42 extra: Add signature field to preventivi_versioni
-- Punto 9: Firma Digitale
-- ═══════════════════════════════════════════════════

ALTER TABLE preventivi_versioni ADD COLUMN IF NOT EXISTS signature_svg TEXT;
ALTER TABLE preventivi_versioni ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE preventivi_versioni ADD COLUMN IF NOT EXISTS signed_by_name TEXT;

-- ═══════════════════════════════════════════════════
-- Punto 39: Sconto "Founding Member"
-- ═══════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS founding_member_locked_price NUMERIC(10,2);

-- ═══════════════════════════════════════════════════
-- Punto 31: Tiering - subscription_plan expansion
-- ═══════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_plan BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_team_members INTEGER DEFAULT 1;

-- ═══════════════════════════════════════════════════
-- Punto 24: Multi-Valuta
-- ═══════════════════════════════════════════════════

ALTER TABLE lavori ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6) DEFAULT 1.0;
ALTER TABLE lavori ADD COLUMN IF NOT EXISTS original_currency TEXT DEFAULT 'EUR';
