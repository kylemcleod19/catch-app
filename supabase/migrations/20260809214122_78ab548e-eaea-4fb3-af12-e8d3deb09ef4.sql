-- Stream details
CREATE TABLE public.spot_stream_data (
  spot_id uuid PRIMARY KEY REFERENCES public.spots(id) ON DELETE CASCADE,
  usgs_site_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spot_stream_data TO authenticated;
GRANT ALL ON public.spot_stream_data TO service_role;
ALTER TABLE public.spot_stream_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own stream data" ON public.spot_stream_data FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_stream_data.spot_id AND s.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_stream_data.spot_id AND s.user_id = auth.uid()));
CREATE TRIGGER update_spot_stream_data_updated_at BEFORE UPDATE ON public.spot_stream_data
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lake details
CREATE TABLE public.spot_lake_data (
  spot_id uuid PRIMARY KEY REFERENCES public.spots(id) ON DELETE CASCADE,
  usgs_site_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spot_lake_data TO authenticated;
GRANT ALL ON public.spot_lake_data TO service_role;
ALTER TABLE public.spot_lake_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own lake data" ON public.spot_lake_data FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_lake_data.spot_id AND s.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_lake_data.spot_id AND s.user_id = auth.uid()));
CREATE TRIGGER update_spot_lake_data_updated_at BEFORE UPDATE ON public.spot_lake_data
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tidal details
CREATE TABLE public.spot_tidal_data (
  spot_id uuid PRIMARY KEY REFERENCES public.spots(id) ON DELETE CASCADE,
  noaa_tide_station_id text,
  noaa_station_name text,
  noaa_station_lat double precision,
  noaa_station_lon double precision,
  noaa_station_distance_miles double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spot_tidal_data TO authenticated;
GRANT ALL ON public.spot_tidal_data TO service_role;
ALTER TABLE public.spot_tidal_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own tidal data" ON public.spot_tidal_data FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_tidal_data.spot_id AND s.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_tidal_data.spot_id AND s.user_id = auth.uid()));
CREATE TRIGGER update_spot_tidal_data_updated_at BEFORE UPDATE ON public.spot_tidal_data
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill
INSERT INTO public.spot_stream_data (spot_id, usgs_site_id)
SELECT id, usgs_site_id FROM public.spots
WHERE is_tidal = false AND site_type <> 'Lake';

INSERT INTO public.spot_lake_data (spot_id, usgs_site_id)
SELECT id, usgs_site_id FROM public.spots
WHERE is_tidal = false AND site_type = 'Lake';

INSERT INTO public.spot_tidal_data (spot_id, noaa_tide_station_id, noaa_station_name, noaa_station_lat, noaa_station_lon, noaa_station_distance_miles)
SELECT id, noaa_tide_station_id, noaa_station_name, noaa_station_lat, noaa_station_lon, noaa_station_distance_miles
FROM public.spots WHERE is_tidal = true;

-- Normalize site_type for tidal spots then drop moved columns
UPDATE public.spots SET site_type = 'Tidal' WHERE is_tidal = true;

ALTER TABLE public.spots
  DROP COLUMN usgs_site_id,
  DROP COLUMN is_tidal,
  DROP COLUMN noaa_tide_station_id,
  DROP COLUMN noaa_station_name,
  DROP COLUMN noaa_station_lat,
  DROP COLUMN noaa_station_lon,
  DROP COLUMN noaa_station_distance_miles;