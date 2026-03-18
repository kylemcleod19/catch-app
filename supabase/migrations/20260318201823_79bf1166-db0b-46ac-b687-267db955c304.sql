
CREATE TABLE public.usgs_monitoring_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text UNIQUE NOT NULL,
  monitoring_location_name text NOT NULL,
  normalized_water_body text,
  site_type text,
  state_code text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usgs_monitoring_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read USGS locations"
  ON public.usgs_monitoring_locations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_usgs_locations_updated_at
  BEFORE UPDATE ON public.usgs_monitoring_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
