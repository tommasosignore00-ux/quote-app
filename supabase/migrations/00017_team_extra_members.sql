-- Add extra_team_members tracking column for metered billing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS extra_team_members INTEGER DEFAULT 0;

-- Update max_team_members default to 5 for new users
ALTER TABLE public.profiles
  ALTER COLUMN max_team_members SET DEFAULT 5;

-- Update existing team users to have max_team_members = 5
UPDATE public.profiles
  SET max_team_members = 5
  WHERE team_plan = true AND max_team_members < 5;
