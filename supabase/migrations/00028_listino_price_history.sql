-- Storico dei prezzi delle voci di listino: ogni volta che un nuovo file del
-- fornitore (o i "Prezzi per forma") cambia il prezzo di una voce esistente.

CREATE TABLE IF NOT EXISTS public.listino_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.listini_vettoriali(id) ON DELETE CASCADE,
  listino_id UUID NOT NULL REFERENCES public.listini(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_price NUMERIC(14,4) NOT NULL,
  new_price NUMERIC(14,4) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listino_price_history_item
  ON public.listino_price_history(item_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_listino_price_history_listino
  ON public.listino_price_history(listino_id, changed_at DESC);

ALTER TABLE public.listino_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listino_price_history_read_own" ON public.listino_price_history;
CREATE POLICY "listino_price_history_read_own"
  ON public.listino_price_history
  FOR SELECT
  USING (auth.uid() = profile_id);
