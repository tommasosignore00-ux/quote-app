-- Clients may read and edit their own profile, but billing, entitlement and
-- identity columns change only through the service role or database functions.

DROP POLICY IF EXISTS "profiles_own" ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- SECURITY INVOKER on purpose: current_user must be the caller. Inside SECURITY
-- DEFINER functions it is the function owner, so database functions may write.
CREATE OR REPLACE FUNCTION public.guard_profile_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'profiles are created by the server' USING ERRCODE = '42501';
  END IF;

  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
    OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
    OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
    OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
    OR NEW.team_plan IS DISTINCT FROM OLD.team_plan
    OR NEW.max_team_members IS DISTINCT FROM OLD.max_team_members
    OR NEW.extra_team_members IS DISTINCT FROM OLD.extra_team_members
    OR NEW.is_founding_member IS DISTINCT FROM OLD.is_founding_member
    OR NEW.founding_member_locked_price IS DISTINCT FROM OLD.founding_member_locked_price
    OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
    OR NEW.email IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION 'protected profile column' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_protected_columns ON public.profiles;
CREATE TRIGGER guard_profile_protected_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_columns();

-- Signup data travels in the auth metadata, because with email verification
-- the client has no session yet when the account is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer UUID;
  v_consent TEXT := NEW.raw_user_meta_data->>'gdpr_consent_version';
BEGIN
  IF coalesce(NEW.raw_user_meta_data->>'referral_code', '') <> '' THEN
    SELECT id INTO v_referrer FROM public.profiles
    WHERE referral_code = NEW.raw_user_meta_data->>'referral_code'
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, referred_by, gdpr_consent_at, gdpr_consent_version)
  VALUES (
    NEW.id,
    NEW.email,
    v_referrer,
    CASE WHEN v_consent IS NOT NULL THEN now() END,
    v_consent
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_referrer IS NOT NULL THEN
    BEGIN
      INSERT INTO public.affiliate_referrals (referrer_id, referred_id, referral_code, status)
      VALUES (v_referrer, NEW.id, NEW.raw_user_meta_data->>'referral_code', 'registered');
    EXCEPTION WHEN OTHERS THEN
      -- A referral problem must never stop a registration.
      RAISE WARNING 'referral not recorded for new user';
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();

-- The extra member count follows the team table; clients no longer send it.
CREATE OR REPLACE FUNCTION public.refresh_extra_team_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID := coalesce(NEW.team_owner_id, OLD.team_owner_id);
BEGIN
  UPDATE public.profiles p
  SET extra_team_members = greatest(0, (
    SELECT count(*) FROM public.team_members tm
    WHERE tm.team_owner_id = v_owner AND tm.active = true
  ) - 5)
  WHERE p.id = v_owner;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS refresh_extra_team_members ON public.team_members;
CREATE TRIGGER refresh_extra_team_members
  AFTER INSERT OR UPDATE OF active, accepted_at OR DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.refresh_extra_team_members();

-- One account per address, when existing rows allow it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE email IS NOT NULL
    GROUP BY lower(email) HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'profiles has duplicate emails: unique index not created';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_key ON public.profiles (lower(email));
  END IF;
END;
$$;
