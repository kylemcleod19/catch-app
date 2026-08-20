DROP POLICY IF EXISTS "Authenticated users can insert water data cache" ON public.water_data_cache;
DROP POLICY IF EXISTS "Authenticated users can insert weather cache" ON public.weather_data_cache;
DROP POLICY IF EXISTS "Authenticated users can insert tide cache" ON public.tide_data_cache;
DROP POLICY IF EXISTS "Authenticated users can update tide cache" ON public.tide_data_cache;

REVOKE INSERT, UPDATE, DELETE ON public.water_data_cache FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.weather_data_cache FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.tide_data_cache FROM authenticated, anon;

GRANT SELECT ON public.water_data_cache TO authenticated;
GRANT SELECT ON public.weather_data_cache TO authenticated;
GRANT SELECT ON public.tide_data_cache TO authenticated;
GRANT ALL ON public.water_data_cache TO service_role;
GRANT ALL ON public.weather_data_cache TO service_role;
GRANT ALL ON public.tide_data_cache TO service_role;

GRANT SELECT ON public.usgs_fishing_water_bodies TO authenticated;

DROP FUNCTION IF EXISTS public.get_distinct_water_bodies(text, text);

CREATE FUNCTION public.get_distinct_water_bodies(_state_code text, _site_type text DEFAULT NULL::text)
RETURNS TABLE(normalized_water_body text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT u.normalized_water_body
  FROM public.usgs_fishing_water_bodies u
  WHERE u.state_code = _state_code
    AND u.normalized_water_body IS NOT NULL
  ORDER BY u.normalized_water_body;
$$;

REVOKE ALL ON FUNCTION public.get_distinct_water_bodies(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_distinct_water_bodies(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_distinct_water_bodies(text, text) TO authenticated;