-- Prezzi per forma nei listini senza prezzi (cataloghi tecnici: travi, tondi, lamiere...).
-- Quando il PDF non contiene prezzi, l'import crea una riga per ogni forma trovata
-- ("Travi HEA", "Tondi laminati"...) e l'utente indica il prezzo per unità (es. €/kg):
-- le voci di quella forma vengono create/aggiornate come peso x prezzo.

CREATE TABLE IF NOT EXISTS public.listino_pricing_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listino_id UUID NOT NULL REFERENCES public.listini(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  reference_unit TEXT NOT NULL DEFAULT 'kg',
  unit_price NUMERIC(14,4),
  item_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listino_id, name)
);

CREATE INDEX IF NOT EXISTS idx_listino_pricing_groups_listino
  ON public.listino_pricing_groups(listino_id);

ALTER TABLE public.listino_pricing_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listino_pricing_groups_own" ON public.listino_pricing_groups;
CREATE POLICY "listino_pricing_groups_own"
  ON public.listino_pricing_groups
  FOR ALL
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE OR REPLACE FUNCTION public.set_listino_pricing_groups_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listino_pricing_groups_updated_at ON public.listino_pricing_groups;
CREATE TRIGGER trg_listino_pricing_groups_updated_at
  BEFORE UPDATE ON public.listino_pricing_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_listino_pricing_groups_updated_at();

-- Forma di appartenenza della voce: la categoria resta uguale al nome della forma e
-- "Riorganizza con AI" non la rinomina.
ALTER TABLE public.listini_vettoriali
  ADD COLUMN IF NOT EXISTS pricing_group TEXT;
