-- Add columns to support AI Trip Planner
-- fishing_trips: plan_json (AI plan + intake answers), forecast_snapshot
ALTER TABLE public.fishing_trips
  ADD COLUMN IF NOT EXISTS plan_json jsonb,
  ADD COLUMN IF NOT EXISTS forecast_snapshot jsonb;

-- profiles: planner defaults (vessel type + preferred fishing method)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS planner_vessel text,
  ADD COLUMN IF NOT EXISTS planner_method text;