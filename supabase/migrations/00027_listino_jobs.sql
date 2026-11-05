-- Lavori lunghi sui listini (import PDF grandi, "Riorganizza con AI") eseguiti in
-- background: la pagina riceve subito l'id del lavoro e ne legge lo stato.

CREATE TABLE IF NOT EXISTS public.listino_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listino_id UUID REFERENCES public.listini(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error')),
  http_status INTEGER,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listino_jobs_profile_created
  ON public.listino_jobs(profile_id, created_at DESC);

ALTER TABLE public.listino_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listino_jobs_read_own" ON public.listino_jobs;
CREATE POLICY "listino_jobs_read_own"
  ON public.listino_jobs
  FOR SELECT
  USING (auth.uid() = profile_id);
