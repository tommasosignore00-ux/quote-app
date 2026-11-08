-- Il link pubblico del preventivo scade: resta valido 90 giorni dall'invio.
-- TODO(legale): durata PROVVISORIA. Per cambiarla basta questa funzione.
CREATE OR REPLACE FUNCTION public.public_quote_link_valid_days()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 90 $$;

ALTER TABLE public.preventivi_versioni
  ADD COLUMN IF NOT EXISTS public_token_expires_at TIMESTAMPTZ;

UPDATE public.preventivi_versioni
  SET public_token_expires_at =
    COALESCE(sent_at, created_at, now()) + make_interval(days => public.public_quote_link_valid_days())
  WHERE public_token_expires_at IS NULL;

-- La scadenza la decide il database, non il client che invia.
CREATE OR REPLACE FUNCTION public.set_public_token_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    NEW.public_token_expires_at :=
      COALESCE(NEW.sent_at, NEW.created_at, now())
      + make_interval(days => public.public_quote_link_valid_days());
  ELSE
    NEW.public_token_expires_at := OLD.public_token_expires_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_public_token_expiry ON public.preventivi_versioni;
CREATE TRIGGER trg_set_public_token_expiry
  BEFORE INSERT OR UPDATE ON public.preventivi_versioni
  FOR EACH ROW EXECUTE FUNCTION public.set_public_token_expiry();
