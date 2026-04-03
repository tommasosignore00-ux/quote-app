-- Add material_markup column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS material_markup DECIMAL(5,2) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN public.profiles.material_markup IS 'Default material markup % for quotes. Applied to material unit prices to calculate final price.';
