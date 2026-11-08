-- What the client received cannot change: edits after sending create a new revision.
-- The SHA-256 of the sent HTML is stored at send and copied with the client's decision.

ALTER TABLE public.preventivi_versioni
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS decision_content_sha256 TEXT;

CREATE OR REPLACE FUNCTION public.protect_sent_quote_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only client roles: server jobs still handle erasure requests and retention.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'Preventivo inviato: non si può eliminare' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.decision_content_sha256 IS DISTINCT FROM OLD.decision_content_sha256
    OR (OLD.sent_at IS NOT NULL AND (
      NEW.html_content IS DISTINCT FROM OLD.html_content
      OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
      OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
    ))
  THEN
    RAISE EXCEPTION 'Preventivo inviato: crea una nuova revisione' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_sent_quote_version ON public.preventivi_versioni;
CREATE TRIGGER protect_sent_quote_version
  BEFORE UPDATE OR DELETE ON public.preventivi_versioni
  FOR EACH ROW EXECUTE FUNCTION public.protect_sent_quote_version();
