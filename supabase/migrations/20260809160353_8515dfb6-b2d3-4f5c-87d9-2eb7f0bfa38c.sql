ALTER TABLE public.spots
  ADD COLUMN IF NOT EXISTS is_tidal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS noaa_tide_station_id text,
  ADD COLUMN IF NOT EXISTS noaa_station_name text,
  ADD COLUMN IF NOT EXISTS noaa_station_lat double precision,
  ADD COLUMN IF NOT EXISTS noaa_station_lon double precision,
  ADD COLUMN IF NOT EXISTS noaa_station_distance_miles double precision;

ALTER TABLE public.fishing_trips
  ADD COLUMN IF NOT EXISTS tide_snapshot jsonb;

CREATE TABLE public.noaa_station_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id uuid NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  product text NOT NULL,
  station_id text NOT NULL,
  station_name text,
  station_lat double precision,
  station_lon double precision,
  distance_miles double precision,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (spot_id, product)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.noaa_station_products TO authenticated;
GRANT ALL ON public.noaa_station_products TO service_role;

ALTER TABLE public.noaa_station_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their spot stations" ON public.noaa_station_products
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can create their spot stations" ON public.noaa_station_products
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can update their spot stations" ON public.noaa_station_products
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can delete their spot stations" ON public.noaa_station_products
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.spots s WHERE s.id = spot_id AND s.user_id = auth.uid()));

CREATE TRIGGER update_noaa_station_products_updated_at
  BEFORE UPDATE ON public.noaa_station_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tide_data_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id text NOT NULL,
  product text NOT NULL,
  date text NOT NULL,
  datum text NOT NULL DEFAULT 'MLLW',
  units text NOT NULL DEFAULT 'english',
  response_json jsonb NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (station_id, product, date, datum, units)
);

GRANT SELECT, INSERT, UPDATE ON public.tide_data_cache TO authenticated;
GRANT ALL ON public.tide_data_cache TO service_role;

ALTER TABLE public.tide_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tide cache" ON public.tide_data_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert tide cache" ON public.tide_data_cache
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update tide cache" ON public.tide_data_cache
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);