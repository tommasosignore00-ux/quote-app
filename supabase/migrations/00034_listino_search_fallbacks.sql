-- Typing-error search for the price list, and exact semantic search.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Runs with the caller's rights: RLS keeps it to the user's and team owner's lists.
-- No trigram index on purpose: the search is scoped to one profile's rows.
CREATE OR REPLACE FUNCTION public.search_listino_typo(p_query text, p_limit int DEFAULT 5)
RETURNS TABLE (
  id uuid,
  description text,
  unit_price decimal,
  markup_percent decimal,
  unit text,
  sku varchar,
  category varchar,
  listino_id uuid,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    lv.id,
    lv.description,
    lv.unit_price,
    lv.markup_percent,
    lv.unit::text,
    lv.sku,
    lv.category,
    lv.listino_id,
    word_similarity(p_query, lv.description) AS similarity
  FROM public.listini_vettoriali lv
  WHERE length(trim(p_query)) >= 4
    AND word_similarity(p_query, lv.description) >= 0.5
  ORDER BY similarity DESC, lv.description
  LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$;

REVOKE EXECUTE ON FUNCTION public.search_listino_typo(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_listino_typo(text, int) TO authenticated, service_role;

-- The ivfflat index covers all customers and is read before the profile filter: with
-- the default single probe a small price list could come back nearly empty. One
-- profile has few enough rows for an exact comparison, which always finds the nearest.
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
  WITH scoped AS MATERIALIZED (
    SELECT lv.id, lv.description, lv.unit_price, lv.markup_percent, lv.sku, lv.category, lv.embedding
    FROM public.listini_vettoriali lv
    WHERE lv.profile_id = ANY (p_profile_ids)
      AND lv.embedding IS NOT NULL
  )
  SELECT
    s.id,
    s.description,
    s.unit_price,
    s.markup_percent,
    s.sku,
    s.category,
    (1 - (s.embedding <=> query_embedding))::float AS similarity
  FROM scoped s
  WHERE 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_listini_profiles(vector, float, int, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_listini_profiles(vector, float, int, uuid[]) TO authenticated, service_role;
