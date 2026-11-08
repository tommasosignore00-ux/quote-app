-- Writes to audit logs and referrals come from the service role and database functions.
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS affiliate_referrals_referred_insert ON public.affiliate_referrals;

-- Global cross-sell rules (profile_id NULL) are read-only for users.
DROP POLICY IF EXISTS "Users can manage their own cross-sell rules" ON public.cross_sell_rules;
DROP POLICY IF EXISTS cross_sell_rules_read ON public.cross_sell_rules;
CREATE POLICY cross_sell_rules_read ON public.cross_sell_rules
  FOR SELECT USING (profile_id IS NULL OR auth.uid() = profile_id);
DROP POLICY IF EXISTS cross_sell_rules_insert_own ON public.cross_sell_rules;
CREATE POLICY cross_sell_rules_insert_own ON public.cross_sell_rules
  FOR INSERT WITH CHECK (auth.uid() = profile_id);
DROP POLICY IF EXISTS cross_sell_rules_update_own ON public.cross_sell_rules;
CREATE POLICY cross_sell_rules_update_own ON public.cross_sell_rules
  FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
DROP POLICY IF EXISTS cross_sell_rules_delete_own ON public.cross_sell_rules;
CREATE POLICY cross_sell_rules_delete_own ON public.cross_sell_rules
  FOR DELETE USING (auth.uid() = profile_id);

-- Invitations go through the server, which checks plan and cap.
DROP POLICY IF EXISTS "Team owners can manage members" ON public.team_members;
DROP POLICY IF EXISTS team_owner_read ON public.team_members;
CREATE POLICY team_owner_read ON public.team_members
  FOR SELECT USING (auth.uid() = team_owner_id);

-- A pending invitation grants nothing.
ALTER TABLE public.team_members ALTER COLUMN active SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_active_team_member_of(p_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_owner_id = p_owner_id
      AND tm.member_id = auth.uid()
      AND tm.active = true
      AND tm.accepted_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_team_listini(p_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_owner_id = p_owner_id
      AND tm.member_id = auth.uid()
      AND tm.active = true
      AND tm.accepted_at IS NOT NULL
      AND coalesce((tm.permissions->>'can_manage_listini')::boolean, false)
  );
$$;

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
    WHERE tm.team_owner_id = v_owner AND tm.active = true AND tm.accepted_at IS NOT NULL
  ) - 5)
  WHERE p.id = v_owner;
  RETURN NULL;
END;
$$;
