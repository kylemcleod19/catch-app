
-- Create a helper function to do the cleanup
CREATE OR REPLACE FUNCTION public.cleanup_fishing_water_bodies(keep_ids text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM public.usgs_fishing_water_bodies WHERE site_id != ALL(keep_ids);
END;
$$;
