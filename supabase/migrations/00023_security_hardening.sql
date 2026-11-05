-- Hardening sicurezza
-- 1. embedding_cache non aveva la RLS: era leggibile/scrivibile da chiunque con la chiave anon.
--    La usa solo la Edge Function voice-process con la service role (che bypassa la RLS),
--    quindi basta attivarla senza policy.
-- 2. Le funzioni SECURITY DEFINER accettavano qualsiasi p_profile_id: un utente poteva
--    gonfiare il contatore preventivi (e quindi l'addebito a consumo) di un altro utente,
--    o leggerne l'uso. Ora accettano solo il proprio profilo (o la service role).
-- 3. search_listini era eseguibile da PUBLIC (anon compreso).

ALTER TABLE public.embedding_cache ENABLE ROW LEVEL SECURITY;

-- Helper: il chiamante può agire su questo profilo?
CREATE OR REPLACE FUNCTION public.can_act_on_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role' OR p_profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION increment_quote_usage(p_profile_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_period_start DATE;
  v_usage RECORD;
  v_result JSONB;
BEGIN
  IF NOT public.can_act_on_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  v_period_start := date_trunc('month', now())::DATE;

  INSERT INTO quote_usage (profile_id, period_start, period_end, quotes_generated)
  VALUES (p_profile_id, v_period_start, (v_period_start + INTERVAL '1 month')::DATE, 1)
  ON CONFLICT (profile_id, period_start) DO UPDATE
    SET quotes_generated = quote_usage.quotes_generated + 1,
        overage_count = GREATEST(0, quote_usage.quotes_generated + 1 - quote_usage.quotes_limit);

  SELECT * INTO v_usage FROM quote_usage
  WHERE profile_id = p_profile_id AND period_start = v_period_start;

  v_result := jsonb_build_object(
    'quotes_generated', v_usage.quotes_generated,
    'quotes_limit', v_usage.quotes_limit,
    'overage', v_usage.overage_count,
    'within_limit', v_usage.quotes_generated <= v_usage.quotes_limit
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_quote_usage(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.can_act_on_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'quotes_generated', COALESCE(qu.quotes_generated, 0),
    'quotes_limit', COALESCE(qu.quotes_limit, 5),
    'overage_count', COALESCE(qu.overage_count, 0),
    'within_limit', COALESCE(qu.quotes_generated, 0) <= COALESCE(qu.quotes_limit, 5),
    'period_start', qu.period_start
  ) INTO result
  FROM quote_usage qu
  WHERE qu.profile_id = p_profile_id
    AND qu.period_start = date_trunc('month', NOW());

  IF result IS NULL THEN
    result := jsonb_build_object(
      'quotes_generated', 0,
      'quotes_limit', 5,
      'overage_count', 0,
      'within_limit', true,
      'period_start', date_trunc('month', NOW())
    );
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.genera_numero_fattura(p_profile_id UUID, p_anno INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
RETURNS VARCHAR(50) AS $$
DECLARE
  v_ultimo_num INTEGER;
  v_numero VARCHAR(50);
BEGIN
  IF NOT public.can_act_on_profile(p_profile_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(numero_fattura FROM '^[0-9]+') AS INTEGER)
  ), 0) INTO v_ultimo_num
  FROM public.fatture
  WHERE profile_id = p_profile_id
    AND EXTRACT(YEAR FROM data_emissione) = p_anno;

  v_numero := LPAD((v_ultimo_num + 1)::TEXT, 6, '0') || '/' || p_anno::TEXT;

  RETURN v_numero;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.can_act_on_profile(p_user_id) AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
    AND (subscription_status IN ('trialing', 'active')
         OR trial_ends_at > NOW())
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Le funzioni non devono essere chiamabili senza login
REVOKE EXECUTE ON FUNCTION increment_quote_usage(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_quote_usage(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.genera_numero_fattura(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_listini(vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION increment_quote_usage(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_quote_usage(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.genera_numero_fattura(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_listini(vector, integer) TO authenticated, service_role;
