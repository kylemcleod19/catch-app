CREATE TABLE public.weather_data_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  date text NOT NULL,
  spot_id uuid REFERENCES public.spots(id) ON DELETE SET NULL,
  response_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (lat, lon, date)
);

ALTER TABLE public.weather_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read weather cache"
  ON public.weather_data_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert weather cache"
  ON public.weather_data_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);