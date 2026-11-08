-- A reset token works once, even under concurrent requests, and using it ends every session.

CREATE OR REPLACE FUNCTION public.consume_password_reset_token(p_token_hash TEXT, p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
BEGIN
  UPDATE public.password_reset_tokens t
  SET used_at = now()
  FROM public.profiles p
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.expires_at > now()
    AND p.id = t.user_id
    AND lower(p.email) = lower(p_email)
  RETURNING t.user_id INTO v_user;

  IF v_user IS NOT NULL THEN
    DELETE FROM public.password_reset_tokens
    WHERE user_id = v_user AND token_hash <> p_token_hash;
  END IF;

  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_password_reset_token(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_password_reset_token(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(UUID) TO service_role;
