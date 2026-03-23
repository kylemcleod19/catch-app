
CREATE OR REPLACE FUNCTION public.get_distinct_water_bodies(_state_code text, _site_type text)
RETURNS TABLE(normalized_water_body text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT DISTINCT u.normalized_water_body
  FROM public.usgs_monitoring_locations u
  WHERE u.state_code = _state_code
    AND u.site_type = _site_type
    AND u.normalized_water_body IS NOT NULL
  ORDER BY u.normalized_water_body;
$$;
