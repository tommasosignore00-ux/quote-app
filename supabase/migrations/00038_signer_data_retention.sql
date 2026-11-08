-- Dati tecnici di chi risponde al preventivo (IP e browser): solo il server può
-- azzerarli, e ogni notte si azzerano quelli oltre il periodo di conservazione.

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
     OR (NEW.client_ip IS DISTINCT FROM OLD.client_ip
         AND NOT (NEW.client_ip IS NULL AND auth.role() IS NOT DISTINCT FROM 'service_role'))
     OR (NEW.client_user_agent IS DISTINCT FROM OLD.client_user_agent
         AND NOT (NEW.client_user_agent IS NULL AND auth.role() IS NOT DISTINCT FROM 'service_role')) THEN
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

CREATE OR REPLACE FUNCTION public.purge_quote_signer_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- TODO(legale): periodi PROVVISORI, da confermare con il legale.
  keep_after_rejection CONSTANT INTERVAL := INTERVAL '12 months';
  keep_after_acceptance CONSTANT INTERVAL := INTERVAL '10 years';
BEGIN
  -- pg_cron non ha un JWT: il trigger qui sopra riconosce il server da questo ruolo,
  -- valido solo per questa transazione.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  UPDATE public.preventivi_versioni
    SET client_ip = NULL, client_user_agent = NULL
    WHERE (client_ip IS NOT NULL OR client_user_agent IS NOT NULL)
      AND (
        (client_decision = 'rejected' AND client_decision_at < now() - keep_after_rejection)
        OR (client_decision = 'accepted' AND client_decision_at < now() - keep_after_acceptance)
      );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_quote_signer_data() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'purge-quote-signer-data',
  '15 3 * * *',
  $$ SELECT public.purge_quote_signer_data(); $$
);
