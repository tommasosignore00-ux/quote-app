-- Saving a quote version creates its public /q/ link: only an entitled account may do it.
-- Row Level Security checks ownership only, so a user whose trial ended could still
-- create client links from the browser or the app. Emails were already gated in send-email.
CREATE OR REPLACE FUNCTION public.require_entitlement_for_quote_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server code (service role) and maintenance are not affected. Inside SECURITY DEFINER
  -- current_user is the function owner, so the caller's role comes from the request.
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- auth.uid() is the person saving: team members are entitled through their owner.
  IF auth.uid() IS NULL OR NOT public.profile_is_entitled(auth.uid()) THEN
    RAISE EXCEPTION 'Serve un abbonamento attivo per salvare o inviare un preventivo'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.require_entitlement_for_quote_version() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_entitlement_for_quote_version ON public.preventivi_versioni;
CREATE TRIGGER require_entitlement_for_quote_version
  BEFORE INSERT ON public.preventivi_versioni
  FOR EACH ROW EXECUTE FUNCTION public.require_entitlement_for_quote_version();
