import { supabase } from "@/integrations/supabase/client";
import { createSpotTypeData, flattenSpot, setSpotUsgsSite, setSpotTidalStation } from "./spotData";
import { toFipsStateCode } from "./us-states";
import { fetchNearbyTideStations } from "./tide";
import type { SpotLite } from "./planTrip";

export const TIME_OPTIONS = ["Dawn", "Morning", "Midday", "Afternoon", "Evening", "Night"];
export type WaterKind = "Stream" | "Lake" | "Tidal";
export const FORECAST_DAYS = 7;

export const daysOut = (date: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(date + "T00:00").getTime() - today.getTime()) / 86400000);
};
export const hasForecast = (date: string) => {
  const d = daysOut(date);
  return d >= 0 && d <= FORECAST_DAYS;
};

export const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export interface Area {
  label: string;
  lat: number;
  lng: number;
  stateAbbr: string | null;
}

export interface SpotSuggestion {
  name: string;
  search_query: string;
  why: string;
  species: string[];
  lat: number;
  lng: number;
}

export interface SpeciesSuggestion {
  name: string;
  why: string;
}

export interface NearbyWater {
  name: string;
  lat: number;
  lng: number;
  miles: number;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("plan-suggest", { body });
  if (error) {
    let msg = "Suggestions are unavailable right now";
    try {
      const ctx = await (error as any).context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Up to 3 AI spot picks, grounded on nearby monitored waters and geocoded for accurate pins. */
export async function suggestSpots(params: {
  area: Area;
  waterType: WaterKind;
  date: string;
  species?: string[];
  nearby: NearbyWater[];
}): Promise<SpotSuggestion[]> {
  const res = await invoke<{ items: SpotSuggestion[] }>({
    kind: params.species?.length ? "species_spots" : "spots",
    area: params.area.label,
    lat: params.area.lat,
    lng: params.area.lng,
    water_type: params.waterType,
    date: params.date,
    species: params.species || [],
    nearby: params.nearby.slice(0, 12).map((n) => `${n.name} (${n.miles.toFixed(0)} mi)`),
  });
  const items = (res.items || []).slice(0, 3);
  // Model coordinates are rough; geocode for the real location when Maps is loaded.
  if (typeof google !== "undefined" && google.maps?.Geocoder) {
    const geocoder = new google.maps.Geocoder();
    for (const it of items) {
      try {
        const { results } = await geocoder.geocode({ address: it.search_query || `${it.name}, ${params.area.label}` });
        const loc = results?.[0]?.geometry?.location;
        if (loc && milesBetween(params.area, { lat: loc.lat(), lng: loc.lng() }) < 80) {
          it.lat = loc.lat();
          it.lng = loc.lng();
        }
      } catch { /* keep model coordinates */ }
    }
  }
  return items;
}

export async function suggestSpecies(params: {
  waterName: string;
  waterType: WaterKind;
  date: string;
  lat?: number | null;
  lng?: number | null;
  pastSpecies?: string[];
}): Promise<SpeciesSuggestion[]> {
  const res = await invoke<{ items: SpeciesSuggestion[] }>({
    kind: "species",
    area: params.waterName,
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    water_type: params.waterType,
    date: params.date,
    species: params.pastSpecies || [],
    nearby: [],
  });
  return (res.items || []).slice(0, 3);
}

/** Monitored USGS waters of the chosen type near the area, closest first. */
export async function fetchNearbyWaters(area: Area, waterType: WaterKind): Promise<NearbyWater[]> {
  if (waterType === "Tidal") {
    const stations = await fetchNearbyTideStations(area.lat, area.lng, "tide_predictions", 8);
    return stations.map((s) => ({ name: s.stationName, lat: s.stationLat, lng: s.stationLon, miles: s.distanceMiles }));
  }
  const d = 0.6;
  const { data } = await supabase
    .from("usgs_fishing_water_bodies")
    .select("normalized_water_body, monitoring_location_name, latitude, longitude, site_type")
    .gte("latitude", area.lat - d)
    .lte("latitude", area.lat + d)
    .gte("longitude", area.lng - d)
    .lte("longitude", area.lng + d)
    .limit(400);
  const best = new Map<string, NearbyWater>();
  (data || []).forEach((r: any) => {
    if (r.latitude == null || r.longitude == null) return;
    const st = (r.site_type || "").toLowerCase();
    if (waterType === "Lake" && st && !st.includes("lake")) return;
    if (waterType === "Stream" && st.includes("lake")) return;
    const name = r.normalized_water_body || r.monitoring_location_name;
    const miles = milesBetween(area, { lat: r.latitude, lng: r.longitude });
    const cur = best.get(name);
    if (!cur || miles < cur.miles) best.set(name, { name, lat: r.latitude, lng: r.longitude, miles });
  });
  return [...best.values()].sort((a, b) => a.miles - b.miles).slice(0, 8);
}

/** Saves a new spot with one pin; state comes from the area the angler entered. */
export async function createSpotAt(params: {
  name: string;
  bodyOfWater: string;
  lat: number;
  lng: number;
  waterType: WaterKind;
  stateAbbr: string | null;
}): Promise<SpotLite> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Please sign in first");
  const { data: spotRow, error } = await supabase
    .from("spots")
    .insert({
      user_id: userData.user.id,
      name: params.name,
      body_of_water: params.bodyOfWater,
      state_code: toFipsStateCode(params.stateAbbr) || "US",
      site_type: params.waterType,
    })
    .select("id, name, body_of_water, state_code, site_type")
    .single();
  if (error) throw error;
  const point = { id: crypto.randomUUID(), label: "Primary access", latitude: params.lat, longitude: params.lng };
  try {
    const { error: pErr } = await supabase.from("spot_points").insert({ ...point, spot_id: spotRow.id });
    if (pErr) throw pErr;
    const { error: tErr } = await createSpotTypeData(spotRow.id, params.waterType, {});
    if (tErr) throw tErr;
  } catch (e) {
    await supabase.from("spots").delete().eq("id", spotRow.id);
    throw e;
  }
  return flattenSpot({
    ...spotRow,
    spot_points: [point],
    spot_stream_data: params.waterType === "Stream" ? [{ usgs_site_id: null }] : [],
    spot_lake_data: params.waterType === "Lake" ? [{ usgs_site_id: null }] : [],
    spot_tidal_data: params.waterType === "Tidal" ? [{}] : [],
  }) as unknown as SpotLite;
}

export interface StationMatch {
  kind: "usgs" | "tide";
  id: string;
  name: string;
  lat: number;
  lng: number;
  miles: number;
  params?: string[];
}

/** Finds the best nearby station for a spot without linking it. */
export async function findBestStation(spot: SpotLite): Promise<StationMatch | null> {
  const p = spot.spot_points?.[0];
  if (!p) return null;
  const here = { lat: p.latitude, lng: p.longitude };
  const tidal = spot.is_tidal || spot.site_type === "Tidal";
  if (tidal) {
    const [s] = await fetchNearbyTideStations(p.latitude, p.longitude, "tide_predictions", 1);
    return s ? { kind: "tide", id: s.stationId, name: s.stationName, lat: s.stationLat, lng: s.stationLon, miles: s.distanceMiles } : null;
  }
  const d = 0.5;
  const { data } = await supabase
    .from("usgs_fishing_water_bodies")
    .select("site_id, monitoring_location_name, normalized_water_body, latitude, longitude")
    .gte("latitude", p.latitude - d)
    .lte("latitude", p.latitude + d)
    .gte("longitude", p.longitude - d)
    .lte("longitude", p.longitude + d)
    .limit(300);
  const rows = (data || []).filter((r: any) => r.latitude != null && r.longitude != null);
  if (!rows.length) return null;
  const { data: avail } = await supabase
    .from("usgs_water_bodies_available_data")
    .select("site_id, water_flow, gage_height, temp, turbidity")
    .in("site_id", rows.map((r: any) => r.site_id));
  const av = new Map<string, any>((avail || []).map((a: any) => [a.site_id, a]));
  const need = spot.site_type === "Lake" ? "gage_height" : "water_flow";
  const water = (spot.body_of_water || "").trim().toLowerCase();
  const isSame = (r: any) =>
    !!water &&
    ((r.normalized_water_body || "").toLowerCase() === water ||
      (r.monitoring_location_name || "").toLowerCase().includes(water));
  // Stations must be on the chosen water when any exist nearby.
  const same = rows.filter(isSame);
  const pool = same.length ? same : rows;
  const scored = pool
    .map((r: any) => {
      const miles = milesBetween(here, { lat: r.latitude, lng: r.longitude });
      const a = av.get(r.site_id);
      const score = miles - (a?.[need] ? 10 : 0);
      const params = a ? [a.water_flow && "Flow", a.gage_height && "Gage", a.temp && "Temp", a.turbidity && "Turbidity"].filter(Boolean) : [];
      return { r, miles, score, params };
    })
    .sort((a, b) => a.score - b.score);
  const top = scored[0];
  if (!top || top.miles > 30) return null;
  return {
    kind: "usgs",
    id: top.r.site_id,
    name: top.r.monitoring_location_name,
    lat: top.r.latitude,
    lng: top.r.longitude,
    miles: top.miles,
    params: top.params as string[],
  };
}

export async function linkStation(spot: SpotLite, m: StationMatch) {
  if (m.kind === "tide") {
    return setSpotTidalStation(spot.id, {
      stationId: m.id,
      stationName: m.name,
      stationLat: m.lat,
      stationLon: m.lng,
      distanceMiles: m.miles,
    });
  }
  return setSpotUsgsSite(spot.id, spot.site_type, m.id);
}
