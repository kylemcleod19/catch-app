import { supabase } from "@/integrations/supabase/client";

/**
 * Spot type-specific data lives in dedicated tables:
 *  - spot_stream_data (usgs_site_id)
 *  - spot_lake_data   (usgs_site_id)
 *  - spot_tidal_data  (noaa station info)
 * These helpers keep the join + flatten logic in one place.
 */

export const SPOT_TYPE_SELECT =
  "spot_stream_data(usgs_site_id), spot_lake_data(usgs_site_id), spot_tidal_data(noaa_tide_station_id, noaa_station_name, noaa_station_lat, noaa_station_lon, noaa_station_distance_miles)";

export interface SpotTypeData {
  usgs_site_id: string | null;
  is_tidal: boolean;
  noaa_tide_station_id: string | null;
  noaa_station_name: string | null;
  noaa_station_lat: number | null;
  noaa_station_lon: number | null;
  noaa_station_distance_miles: number | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/** Flattens the joined type tables back onto the spot object. */
export function flattenSpot<T extends Record<string, any>>(row: T): T & SpotTypeData {
  const stream = one<any>(row.spot_stream_data);
  const lake = one<any>(row.spot_lake_data);
  const tidal = one<any>(row.spot_tidal_data);
  const isTidal = row.site_type === "Tidal" || !!tidal;

  return {
    ...row,
    usgs_site_id: (lake?.usgs_site_id ?? stream?.usgs_site_id) || null,
    is_tidal: isTidal,
    noaa_tide_station_id: tidal?.noaa_tide_station_id ?? null,
    noaa_station_name: tidal?.noaa_station_name ?? null,
    noaa_station_lat: tidal?.noaa_station_lat ?? null,
    noaa_station_lon: tidal?.noaa_station_lon ?? null,
    noaa_station_distance_miles: tidal?.noaa_station_distance_miles ?? null,
  };
}

export function flattenSpots<T extends Record<string, any>>(rows: T[] | null | undefined) {
  return (rows || []).map(flattenSpot);
}

const usgsTable = (siteType: string) =>
  siteType === "Lake" ? "spot_lake_data" : "spot_stream_data";

/** Creates the type-specific row for a freshly created spot. */
export async function createSpotTypeData(
  spotId: string,
  siteType: string,
  payload: { usgsSiteId?: string | null; noaa?: Partial<SpotTypeData> | null }
) {
  if (siteType === "Tidal") {
    const n = payload.noaa;
    return supabase.from("spot_tidal_data").insert({
      spot_id: spotId,
      noaa_tide_station_id: n?.noaa_tide_station_id ?? null,
      noaa_station_name: n?.noaa_station_name ?? null,
      noaa_station_lat: n?.noaa_station_lat ?? null,
      noaa_station_lon: n?.noaa_station_lon ?? null,
      noaa_station_distance_miles: n?.noaa_station_distance_miles ?? null,
    } as any);
  }
  return supabase
    .from(usgsTable(siteType) as any)
    .insert({ spot_id: spotId, usgs_site_id: payload.usgsSiteId ?? null } as any);
}

/** Links (or clears) the USGS station for a stream/lake spot. */
export async function setSpotUsgsSite(spotId: string, siteType: string, usgsSiteId: string | null) {
  return supabase
    .from(usgsTable(siteType) as any)
    .upsert({ spot_id: spotId, usgs_site_id: usgsSiteId } as any, { onConflict: "spot_id" });
}

/** Links (or clears) the NOAA tide station for a tidal spot. */
export async function setSpotTidalStation(
  spotId: string,
  station: {
    stationId?: string | null;
    stationName?: string | null;
    stationLat?: number | null;
    stationLon?: number | null;
    distanceMiles?: number | null;
  } | null,
) {
  return supabase.from("spot_tidal_data").upsert(
    {
      spot_id: spotId,
      noaa_tide_station_id: station?.stationId ?? null,
      noaa_station_name: station?.stationName ?? null,
      noaa_station_lat: station?.stationLat ?? null,
      noaa_station_lon: station?.stationLon ?? null,
      noaa_station_distance_miles: station?.distanceMiles ?? null,
    } as any,
    { onConflict: "spot_id" },
  );
}


/** Reads just the USGS site id for a spot, whichever water type it is. */
export async function getSpotUsgsSiteId(spotId: string): Promise<string | null> {
  const { data } = await supabase
    .from("spots")
    .select(`id, site_type, ${SPOT_TYPE_SELECT}`)
    .eq("id", spotId)
    .maybeSingle();
  if (!data) return null;
  return flattenSpot(data as any).usgs_site_id;
}
