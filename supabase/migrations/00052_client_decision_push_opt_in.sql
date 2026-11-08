-- Push on a client's decision is sent only to users who opted in.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_client_decision BOOLEAN NOT NULL DEFAULT false;
