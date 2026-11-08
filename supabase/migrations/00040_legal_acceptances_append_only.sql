-- Un consenso si registra e si legge: l'utente non deve poterlo modificare o cancellare.
DROP POLICY IF EXISTS "legal_acceptances_own" ON public.legal_acceptances;

CREATE POLICY "legal_acceptances_select_own" ON public.legal_acceptances
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "legal_acceptances_insert_own" ON public.legal_acceptances
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Mai valorizzate: non devono far pensare che IP e browser vengano registrati.
ALTER TABLE public.legal_acceptances
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS user_agent;
