-- Company identity shown on customer documents.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_color TEXT NOT NULL DEFAULT '#1f2937';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_brand_color_hex;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_brand_color_hex CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$') NOT VALID;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_logo_url_https;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_logo_url_https CHECK (logo_url IS NULL OR logo_url ~* '^https://') NOT VALID;

-- The answer popup now includes rejections: past ones must not all appear at once.
UPDATE public.preventivi_versioni
SET owner_notified_at = now()
WHERE client_decision = 'rejected' AND owner_notified_at IS NULL;
