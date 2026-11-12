-- VAT rate chosen per job/quote (e.g. 22, 10, 4). NULL means "use the profile's rate".
-- preventivi_dettaglio.tax_rate is the markup (ricarico) on the purchase price, never VAT.
ALTER TABLE public.lavori
  ADD COLUMN IF NOT EXISTS vat_percent NUMERIC(5,2)
  CHECK (vat_percent IS NULL OR (vat_percent >= 0 AND vat_percent <= 100));

COMMENT ON COLUMN public.lavori.vat_percent IS
  'VAT rate for this job''s quote; NULL = profile default.';
COMMENT ON COLUMN public.preventivi_dettaglio.tax_rate IS
  'Markup (ricarico) percent on unit_price, the purchase price. The client sees unit_price * (1 + tax_rate/100). Not VAT.';
