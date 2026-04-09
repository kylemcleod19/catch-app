
CREATE TABLE public.usgs_water_bodies_available_data (
  site_id text PRIMARY KEY,
  water_flow boolean NOT NULL DEFAULT false,
  gage_height boolean NOT NULL DEFAULT false,
  temp boolean NOT NULL DEFAULT false,
  turbidity boolean NOT NULL DEFAULT false,
  last_updated text
);

ALTER TABLE public.usgs_water_bodies_available_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read available data"
ON public.usgs_water_bodies_available_data
FOR SELECT TO authenticated
USING (true);
