-- I membri attivi di un team vedono i listini del titolare oltre ai propri.
-- Modificano quelli del titolare solo con il permesso can_manage_listini.
-- Le policy *_own restano invariate: titolari e account singoli non cambiano.

CREATE OR REPLACE FUNCTION public.is_active_team_member_of(p_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_owner_id = p_owner_id
      AND tm.member_id = auth.uid()
      AND tm.active = true
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
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_owner_id = p_owner_id
      AND tm.member_id = auth.uid()
      AND tm.active = true
      AND coalesce((tm.permissions->>'can_manage_listini')::boolean, false)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_team_member_of(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_team_listini(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_team_member_of(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_team_listini(UUID) TO authenticated, service_role;

-- Lettura
DROP POLICY IF EXISTS "listini_team_read" ON public.listini;
CREATE POLICY "listini_team_read" ON public.listini
  FOR SELECT USING (public.is_active_team_member_of(profile_id));

DROP POLICY IF EXISTS "listini_vettoriali_team_read" ON public.listini_vettoriali;
CREATE POLICY "listini_vettoriali_team_read" ON public.listini_vettoriali
  FOR SELECT USING (public.is_active_team_member_of(profile_id));

DROP POLICY IF EXISTS "listino_pricing_groups_team_read" ON public.listino_pricing_groups;
CREATE POLICY "listino_pricing_groups_team_read" ON public.listino_pricing_groups
  FOR SELECT USING (public.is_active_team_member_of(profile_id));

DROP POLICY IF EXISTS "listino_category_markups_team_read" ON public.listino_category_markups;
CREATE POLICY "listino_category_markups_team_read" ON public.listino_category_markups
  FOR SELECT USING (public.is_active_team_member_of(profile_id));

DROP POLICY IF EXISTS "listino_price_history_team_read" ON public.listino_price_history;
CREATE POLICY "listino_price_history_team_read" ON public.listino_price_history
  FOR SELECT USING (public.is_active_team_member_of(profile_id));

-- Modifica con can_manage_listini (forme e ricarichi passano dalle API web)
DROP POLICY IF EXISTS "listini_team_update" ON public.listini;
CREATE POLICY "listini_team_update" ON public.listini
  FOR UPDATE
  USING (public.can_manage_team_listini(profile_id))
  WITH CHECK (public.can_manage_team_listini(profile_id));

DROP POLICY IF EXISTS "listini_team_delete" ON public.listini;
CREATE POLICY "listini_team_delete" ON public.listini
  FOR DELETE USING (public.can_manage_team_listini(profile_id));

DROP POLICY IF EXISTS "listini_vettoriali_team_insert" ON public.listini_vettoriali;
CREATE POLICY "listini_vettoriali_team_insert" ON public.listini_vettoriali
  FOR INSERT WITH CHECK (public.can_manage_team_listini(profile_id));

DROP POLICY IF EXISTS "listini_vettoriali_team_update" ON public.listini_vettoriali;
CREATE POLICY "listini_vettoriali_team_update" ON public.listini_vettoriali
  FOR UPDATE
  USING (public.can_manage_team_listini(profile_id))
  WITH CHECK (public.can_manage_team_listini(profile_id));

DROP POLICY IF EXISTS "listini_vettoriali_team_delete" ON public.listini_vettoriali;
CREATE POLICY "listini_vettoriali_team_delete" ON public.listini_vettoriali
  FOR DELETE USING (public.can_manage_team_listini(profile_id));

-- Ricerca semantica su più profili (membro + titolare). Senza SECURITY DEFINER:
-- per gli utenti loggati vale la RLS.
CREATE OR REPLACE FUNCTION public.match_listini_profiles(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_profile_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  description text,
  unit_price decimal,
  markup_percent decimal,
  sku varchar,
  category varchar,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lv.id,
    lv.description,
    lv.unit_price,
    lv.markup_percent,
    lv.sku,
    lv.category,
    1 - (lv.embedding <=> query_embedding) AS similarity
  FROM public.listini_vettoriali lv
  WHERE lv.profile_id = ANY (p_profile_ids)
    AND lv.embedding IS NOT NULL
    AND 1 - (lv.embedding <=> query_embedding) > match_threshold
  ORDER BY lv.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_listini_profiles(vector, float, int, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_listini_profiles(vector, float, int, uuid[]) TO authenticated, service_role;
