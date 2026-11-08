-- I loghi dei template sono file pubblici: la cartella non deve contenere l'id utente.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS template_assets_folder UUID NOT NULL DEFAULT gen_random_uuid();

-- La cancellazione account svuota questa cartella: l'utente non deve poterla cambiare
-- per puntare a quella di un altro.
CREATE OR REPLACE FUNCTION public.keep_template_assets_folder()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.template_assets_folder := OLD.template_assets_folder;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_template_assets_folder ON public.profiles;
CREATE TRIGGER trg_keep_template_assets_folder
  BEFORE UPDATE OF template_assets_folder ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.keep_template_assets_folder();
