-- Function to perform k-NN search on listini_vettoriali using pgvector
CREATE OR REPLACE FUNCTION public.search_listini(query_embedding vector(1536), limit_k integer)
RETURNS TABLE(
  id uuid,
  description text,
  unit_price numeric,
  listino_id uuid,
  distance float,
  created_at timestamptz
) AS $$
  SELECT id, description, unit_price AS unit_price, listino_id, (embedding <-> query_embedding) AS distance, created_at
  FROM public.listini_vettoriali
  ORDER BY embedding <-> query_embedding
  LIMIT limit_k;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION public.search_listini(vector(1536), integer) TO public;
