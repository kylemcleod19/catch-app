
-- Create staging table for bulk import
CREATE TEMP TABLE _tx_staging (site_id TEXT NOT NULL, normalized_water_body TEXT);

-- The staging table will be populated via INSERT statements below
-- Then we update the main table

-- This migration just ensures the update runs atomically
-- We'll use the insert tool to populate and update
