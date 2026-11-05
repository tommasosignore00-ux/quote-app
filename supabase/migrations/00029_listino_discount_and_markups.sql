-- Sconto fornitore per listino e ricarico per categoria.
-- unit_price resta il costo netto usato ovunque (preventivi, ricerca, voce):
--   unit_price = list_price x (1 - sconto fornitore %)
-- Il ricarico per categoria imposta markup_percent sulle voci della categoria.

ALTER TABLE public.listini
  ADD COLUMN IF NOT EXISTS supplier_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (supplier_discount_percent >= 0 AND supplier_discount_percent < 100);

ALTER TABLE public.listini_vettoriali
  ADD COLUMN IF NOT EXISTS list_price NUMERIC(14,4);

CREATE TABLE IF NOT EXISTS public.listino_category_markups (
  listino_id UUID NOT NULL REFERENCES public.listini(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  markup_percent NUMERIC(6,2) NOT NULL CHECK (markup_percent >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listino_id, category)
);

ALTER TABLE public.listino_category_markups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listino_category_markups_own" ON public.listino_category_markups;
CREATE POLICY "listino_category_markups_own"
  ON public.listino_category_markups
  FOR ALL
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- Recomputes net prices from list prices and applies category markups for a listino.
-- Items priced per shape ("Prezzi per forma") already carry the user's own net price.
CREATE OR REPLACE FUNCTION public.apply_listino_pricing(p_listino_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discount NUMERIC;
  v_count INTEGER := 0;
BEGIN
  SELECT supplier_discount_percent INTO v_discount FROM public.listini WHERE id = p_listino_id;
  IF v_discount IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.listini_vettoriali v
  SET list_price = COALESCE(v.list_price, v.unit_price),
      unit_price = ROUND(COALESCE(v.list_price, v.unit_price) * (1 - v_discount / 100), 4)
  WHERE v.listino_id = p_listino_id
    AND v.pricing_group IS NULL
    AND ROUND(COALESCE(v.list_price, v.unit_price) * (1 - v_discount / 100), 4) IS DISTINCT FROM v.unit_price;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.listini_vettoriali v
  SET markup_percent = m.markup_percent
  FROM public.listino_category_markups m
  WHERE m.listino_id = p_listino_id
    AND v.listino_id = p_listino_id
    AND v.category = m.category
    AND v.markup_percent IS DISTINCT FROM m.markup_percent;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_listino_pricing(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_listino_pricing(UUID) TO service_role;
