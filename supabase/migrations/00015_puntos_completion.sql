-- Migration 00015: Additional columns and functions for Puntos 22-43
-- Depends on: 00014_features_expansion

-- ============================================================
-- Punto 22/23: Client country code and preferred language
-- ============================================================
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'IT';
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'it';

-- ============================================================
-- Punto 25: US state for sales tax
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS us_state TEXT;

-- ============================================================
-- Punto 27: GDPR consent tracking
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gdpr_consent_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gdpr_consent_version TEXT;

-- ============================================================
-- Punto 33: Read-only quote usage function (avoid incrementing on every view)
-- ============================================================
CREATE OR REPLACE FUNCTION get_quote_usage(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'quotes_generated', COALESCE(qu.quotes_generated, 0),
    'quotes_limit', COALESCE(qu.quotes_limit, 5),
    'overage_count', COALESCE(qu.overage_count, 0),
    'within_limit', COALESCE(qu.quotes_generated, 0) <= COALESCE(qu.quotes_limit, 5),
    'period_start', qu.period_start
  ) INTO result
  FROM quote_usage qu
  WHERE qu.profile_id = p_profile_id
    AND qu.period_start = date_trunc('month', NOW());

  IF result IS NULL THEN
    result := jsonb_build_object(
      'quotes_generated', 0,
      'quotes_limit', 5,
      'overage_count', 0,
      'within_limit', true,
      'period_start', date_trunc('month', NOW())
    );
  END IF;

  RETURN result;
END;
$$;

-- ============================================================
-- Punto 35: Auto-generate referral code on profile creation
-- ============================================================
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'QA-' || UPPER(SUBSTRING(md5(NEW.id::text) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referral_code ON profiles;
CREATE TRIGGER trg_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.referral_code IS NULL)
  EXECUTE FUNCTION generate_referral_code();

-- ============================================================
-- Punto 39: Auto-mark founding members (first 100 users)
-- ============================================================
CREATE OR REPLACE FUNCTION check_founding_member()
RETURNS TRIGGER AS $$
DECLARE
  total_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_users FROM profiles;
  IF total_users <= 100 THEN
    NEW.is_founding_member := true;
    NEW.founding_member_locked_price := 19.99;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_founding_member ON profiles;
CREATE TRIGGER trg_founding_member
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_founding_member();

-- ============================================================
-- RLS policies for new features
-- ============================================================

-- Ensure affiliate_referrals has proper RLS for referred_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'affiliate_referrals_referred_insert' AND tablename = 'affiliate_referrals') THEN
    CREATE POLICY affiliate_referrals_referred_insert ON affiliate_referrals
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
