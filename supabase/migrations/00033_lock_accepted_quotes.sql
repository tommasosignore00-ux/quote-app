-- Un preventivo accettato dal cliente è definitivo: voci, lavoro e versione non si
-- possono più cambiare né cancellare, da nessuna schermata. Il blocco è nel database.
-- Resta possibile la cancellazione a cascata dell'intero account (diritto GDPR).
-- owner_notified_at: quando il titolare ha visto l'avviso "Preventivo accettato".

ALTER TABLE public.preventivi_versioni
  ADD COLUMN IF NOT EXISTS owner_notified_at TIMESTAMPTZ;

-- Le risposte già arrivate non devono far comparire avvisi vecchi.
UPDATE public.preventivi_versioni
  SET owner_notified_at = client_decision_at
  WHERE client_decision IS NOT NULL AND owner_notified_at IS NULL;

CREATE OR REPLACE FUNCTION public.quote_is_accepted(p_lavoro_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.preventivi_versioni
    WHERE lavoro_id = p_lavoro_id AND client_decision = 'accepted'
  );
$$;

-- Voci del preventivo
CREATE OR REPLACE FUNCTION public.protect_accepted_quote_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- pg_trigger_depth() > 1: cancellazione a cascata dell'account.
    IF pg_trigger_depth() = 1 AND public.quote_is_accepted(OLD.lavoro_id) THEN
      RAISE EXCEPTION 'Preventivo accettato dal cliente: non si può modificare';
    END IF;
    RETURN OLD;
  END IF;
  IF public.quote_is_accepted(NEW.lavoro_id)
     OR (TG_OP = 'UPDATE' AND public.quote_is_accepted(OLD.lavoro_id)) THEN
    RAISE EXCEPTION 'Preventivo accettato dal cliente: non si può modificare';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_accepted_quote_lines ON public.preventivi_dettaglio;
CREATE TRIGGER trg_protect_accepted_quote_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.preventivi_dettaglio
  FOR EACH ROW EXECUTE FUNCTION public.protect_accepted_quote_lines();

-- Lavoro: restano modificabili solo i campi tecnici (stato, revisione, updated_at).
CREATE OR REPLACE FUNCTION public.protect_accepted_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 AND public.quote_is_accepted(OLD.id) THEN
      RAISE EXCEPTION 'Preventivo accettato dal cliente: il lavoro non si può eliminare';
    END IF;
    RETURN OLD;
  END IF;
  IF public.quote_is_accepted(OLD.id) AND (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.total_tax IS DISTINCT FROM OLD.total_tax
    OR NEW.currency IS DISTINCT FROM OLD.currency
  ) THEN
    RAISE EXCEPTION 'Preventivo accettato dal cliente: non si può modificare';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_accepted_job ON public.lavori;
CREATE TRIGGER trg_protect_accepted_job
  BEFORE UPDATE OR DELETE ON public.lavori
  FOR EACH ROW EXECUTE FUNCTION public.protect_accepted_job();

-- Versioni: la risposta del cliente è una prova e la scrive solo il server.
CREATE OR REPLACE FUNCTION public.protect_quote_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 AND OLD.client_decision IS NOT NULL THEN
      RAISE EXCEPTION 'La risposta del cliente non si può eliminare';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF public.quote_is_accepted(NEW.lavoro_id) THEN
      RAISE EXCEPTION 'Preventivo accettato dal cliente: non si può creare una nuova versione';
    END IF;
    IF NEW.client_decision IS NOT NULL THEN
      RAISE EXCEPTION 'La risposta può arrivare solo dal cliente';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.client_decision IS NULL THEN
    IF NEW.client_decision IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'La risposta può arrivare solo dal cliente';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.client_decision IS DISTINCT FROM OLD.client_decision
     OR NEW.client_decision_at IS DISTINCT FROM OLD.client_decision_at
     OR NEW.client_signer_name IS DISTINCT FROM OLD.client_signer_name
     OR NEW.client_note IS DISTINCT FROM OLD.client_note
     OR NEW.client_ip IS DISTINCT FROM OLD.client_ip
     OR NEW.client_user_agent IS DISTINCT FROM OLD.client_user_agent THEN
    RAISE EXCEPTION 'La risposta del cliente non si può modificare';
  END IF;

  IF OLD.client_decision = 'accepted' AND (
    NEW.html_content IS DISTINCT FROM OLD.html_content
    OR NEW.pdf_path IS DISTINCT FROM OLD.pdf_path
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.lavoro_id IS DISTINCT FROM OLD.lavoro_id
    OR NEW.public_token IS DISTINCT FROM OLD.public_token
    OR NEW.signature_svg IS DISTINCT FROM OLD.signature_svg
  ) THEN
    RAISE EXCEPTION 'Preventivo accettato dal cliente: non si può modificare';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_quote_decision ON public.preventivi_versioni;
CREATE TRIGGER trg_protect_quote_decision
  BEFORE INSERT OR UPDATE OR DELETE ON public.preventivi_versioni
  FOR EACH ROW EXECUTE FUNCTION public.protect_quote_decision();

-- L'avviso compare in tempo reale; RLS limita gli eventi ai preventivi dell'utente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'preventivi_versioni'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.preventivi_versioni;
  END IF;
END;
$$;
