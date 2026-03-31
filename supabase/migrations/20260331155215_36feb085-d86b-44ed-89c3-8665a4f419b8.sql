
CREATE TABLE public.water_data_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoring_location_id text NOT NULL,
  date text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (monitoring_location_id, date)
);

ALTER TABLE public.water_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read water data cache"
  ON public.water_data_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert water data cache"
  ON public.water_data_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);
