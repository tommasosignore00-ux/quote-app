-- Unità di misura su voci di listino e voci del preventivo (colonna "U.M." dei
-- preventivi). Una voce di preventivo presa da un listino eredita l'unità della voce
-- di listino, qualunque sia il punto dell'app che la crea (sito, app, comandi vocali).

ALTER TABLE public.listini_vettoriali ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.preventivi_dettaglio ADD COLUMN IF NOT EXISTS unit TEXT;

CREATE OR REPLACE FUNCTION public.fill_quote_line_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.unit IS NULL OR btrim(NEW.unit) = '') AND NEW.listino_item_id IS NOT NULL THEN
    SELECT unit INTO NEW.unit FROM public.listini_vettoriali WHERE id = NEW.listino_item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_quote_line_unit ON public.preventivi_dettaglio;
CREATE TRIGGER trg_fill_quote_line_unit
  BEFORE INSERT ON public.preventivi_dettaglio
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_quote_line_unit();

-- Voci già importate dai cataloghi tecnici: l'unità è scritta nella descrizione.
UPDATE public.listini_vettoriali SET unit = 'm'
  WHERE unit IS NULL AND description ILIKE '%(prezzo al metro)%';
UPDATE public.listini_vettoriali SET unit = 'pz'
  WHERE unit IS NULL AND description ILIKE '%(prezzo a foglio)%';
