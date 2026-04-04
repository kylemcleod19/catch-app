
CREATE OR REPLACE FUNCTION public.get_distinct_water_bodies(_state_code text, _site_type text)
 RETURNS TABLE(normalized_water_body text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT DISTINCT u.normalized_water_body
  FROM public.usgs_fishing_water_bodies u
  WHERE u.state_code = _state_code
    AND u.site_type = _site_type
    AND u.normalized_water_body IS NOT NULL
  ORDER BY u.normalized_water_body;
$$;

-- Drop the cleanup helper function
DROP FUNCTION IF EXISTS public.cleanup_fishing_water_bodies(text[]);
