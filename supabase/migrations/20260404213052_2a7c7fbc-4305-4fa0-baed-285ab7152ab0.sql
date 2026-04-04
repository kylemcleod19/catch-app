
-- Create a staging table for the keep list
CREATE TABLE public._keep_fishing_sites (site_id text PRIMARY KEY);

-- Grant insert so we can populate it
GRANT INSERT ON public._keep_fishing_sites TO authenticated;
GRANT INSERT ON public._keep_fishing_sites TO anon;
