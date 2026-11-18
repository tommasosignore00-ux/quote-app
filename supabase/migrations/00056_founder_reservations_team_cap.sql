-- Security audit 18/11/2026.
-- 1. Founder places are reserved while the Stripe checkout is open, so the 50 places
--    cannot be oversold by people paying at the same time.
-- 2. A team never exceeds 10 users (owner + 9), even with invitations sent in parallel.

-- 1. Founder reservations ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founder_reservations (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server only: no policy for clients.
ALTER TABLE public.founder_reservations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.founder_slots_left(p_total INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(0, p_total
    - (SELECT count(*) FROM public.profiles WHERE is_founding_member = true)::INTEGER
    - (SELECT count(*) FROM public.founder_reservations r
         JOIN public.profiles p ON p.id = r.profile_id
        WHERE r.expires_at > now() AND p.is_founding_member IS NOT TRUE)::INTEGER);
$$;

/** Reserves (or renews) a founder place for this profile; false when none is left. */
CREATE OR REPLACE FUNCTION public.reserve_founder_slot(
  p_profile_id UUID,
  p_total INTEGER,
  p_minutes INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taken INTEGER;
BEGIN
  -- One reservation at a time across the whole service.
  PERFORM pg_advisory_xact_lock(hashtext('founder_reservations'));
  DELETE FROM public.founder_reservations WHERE expires_at <= now();

  SELECT (SELECT count(*) FROM public.profiles WHERE is_founding_member = true)
       + (SELECT count(*) FROM public.founder_reservations WHERE profile_id <> p_profile_id)
    INTO v_taken;
  IF v_taken >= p_total THEN
    RETURN false;
  END IF;

  INSERT INTO public.founder_reservations (profile_id, expires_at)
  VALUES (p_profile_id, now() + make_interval(mins => p_minutes))
  ON CONFLICT (profile_id) DO UPDATE SET expires_at = EXCLUDED.expires_at;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.founder_slots_left(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_founder_slot(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.founder_slots_left(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_founder_slot(UUID, INTEGER, INTEGER) TO service_role;

-- 2. Team cap --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_team_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Serialises invitations of the same owner.
  PERFORM pg_advisory_xact_lock(hashtext('team_cap:' || NEW.team_owner_id::text));
  SELECT count(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.team_owner_id = NEW.team_owner_id
    AND tm.member_id <> NEW.member_id
    AND (tm.active = true OR tm.accepted_at IS NULL);
  -- 10 users in all: the owner plus 9 members or pending invitations.
  IF v_count >= 9 THEN
    RAISE EXCEPTION 'Il Team arriva al massimo a 10 utenti.' USING ERRCODE = 'P0001', HINT = 'TEAM_FULL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_team_cap ON public.team_members;
CREATE TRIGGER enforce_team_cap
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_cap();
