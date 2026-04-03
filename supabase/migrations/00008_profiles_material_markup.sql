-- Add material markup VAT percent to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS material_markup_vat_percent numeric DEFAULT 0;

-- Ensure column is available for inserts/updates
COMMENT ON COLUMN public.profiles.material_markup_vat_percent IS 'Default VAT % applied to material markups in quotes';
