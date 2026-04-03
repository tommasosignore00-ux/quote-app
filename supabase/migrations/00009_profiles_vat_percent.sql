-- Add default VAT percentage to profiles (used for cost calculations in quotes)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vat_percent DECIMAL(5,2) DEFAULT 22;

COMMENT ON COLUMN public.profiles.vat_percent IS 'Default VAT % for this user, based on country. Used as tax_rate in preventivi_dettaglio.';
