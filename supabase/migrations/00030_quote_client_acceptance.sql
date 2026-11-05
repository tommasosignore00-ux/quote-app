-- Accettazione online del preventivo: ogni versione ha un link segreto da inviare al
-- cliente, che accetta o rifiuta senza account. Nome, data, IP e browser restano come
-- prova. L'accesso pubblico passa solo dal server (service role): nessuna policy RLS.

ALTER TABLE public.preventivi_versioni
  ADD COLUMN IF NOT EXISTS public_token UUID UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_decision TEXT CHECK (client_decision IN ('accepted', 'rejected')),
  ADD COLUMN IF NOT EXISTS client_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_signer_name TEXT,
  ADD COLUMN IF NOT EXISTS client_note TEXT,
  ADD COLUMN IF NOT EXISTS client_ip TEXT,
  ADD COLUMN IF NOT EXISTS client_user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_preventivi_versioni_public_token
  ON public.preventivi_versioni(public_token);
