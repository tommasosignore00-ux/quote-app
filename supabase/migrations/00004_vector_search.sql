-- RPC for semantic search on listini_vettoriali
CREATE OR REPLACE FUNCTION public.match_listini(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  p_profile_id uuid DEFAULT NULL
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
  WHERE (p_profile_id IS NULL OR lv.profile_id = p_profile_id)
    AND lv.embedding IS NOT NULL
    AND 1 - (lv.embedding <=> query_embedding) > match_threshold
  ORDER BY lv.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
