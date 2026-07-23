CREATE TABLE IF NOT EXISTS public.pricing_reference_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  label TEXT NOT NULL,
  match_keywords TEXT[] DEFAULT '{}',
  reference_unit TEXT NOT NULL,
  reference_price NUMERIC(12,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  source_label TEXT,
  source_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_reference_rules_profile
  ON public.pricing_reference_rules(profile_id);

CREATE INDEX IF NOT EXISTS idx_pricing_reference_rules_rule_key
  ON public.pricing_reference_rules(rule_key);

ALTER TABLE public.pricing_reference_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_reference_rules_read" ON public.pricing_reference_rules;
CREATE POLICY "pricing_reference_rules_read"
  ON public.pricing_reference_rules
  FOR SELECT
  USING (profile_id IS NULL OR auth.uid() = profile_id);

DROP POLICY IF EXISTS "pricing_reference_rules_write" ON public.pricing_reference_rules;
CREATE POLICY "pricing_reference_rules_write"
  ON public.pricing_reference_rules
  FOR ALL
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE OR REPLACE FUNCTION public.set_pricing_reference_rules_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_reference_rules_updated_at ON public.pricing_reference_rules;
CREATE TRIGGER trg_pricing_reference_rules_updated_at
  BEFORE UPDATE ON public.pricing_reference_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pricing_reference_rules_updated_at();
