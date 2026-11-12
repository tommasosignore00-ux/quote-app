-- VAT rate of a single quote line. NULL means "the quote's rate" (lavori.vat_percent,
-- else the profile's).
ALTER TABLE public.preventivi_dettaglio
  ADD COLUMN IF NOT EXISTS vat_percent NUMERIC(5,2)
  CHECK (vat_percent IS NULL OR (vat_percent >= 0 AND vat_percent <= 100));

COMMENT ON COLUMN public.preventivi_dettaglio.vat_percent IS
  'VAT rate of this line; NULL = the quote''s rate.';
