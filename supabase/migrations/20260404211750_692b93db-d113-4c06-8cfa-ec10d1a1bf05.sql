
CREATE TABLE public.usgs_fishing_water_bodies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id text NOT NULL,
  monitoring_location_name text NOT NULL,
  normalized_water_body text,
  site_type text,
  state_code text,
  latitude double precision,
  longitude double precision,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(site_id)
);

ALTER TABLE public.usgs_fishing_water_bodies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fishing water bodies"
  ON public.usgs_fishing_water_bodies
  FOR SELECT
  TO authenticated
  USING (true);
