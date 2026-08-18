import { supabase } from "@/integrations/supabase/client";
import { SPOT_TYPE_SELECT, flattenSpots, flattenSpot, type SpotTypeData } from "./spotData";

// ── Types ──

export interface PlannerIntake {
  vessel: string | null;
  species: string[];
  method: string | null;
  time_available: string | null;
  travel_distance: string | null;
  date: string | null;
  location_query: string | null;
  notes: string | null;
}

export interface SpotLite extends SpotTypeData {
  id: string;
  name: string | null;
  body_of_water: string;
  state_code: string;
  site_type: string;
  spot_points: { id: string; label: string; latitude: number; longitude: number }[];
}

export interface PastInsights {
  totalTrips: number;
  bestHours: string[];
  topSpecies: string[];
  topTackle: string[];
  bestConditions: string | null;
}

export interface DayBlock {
  window: string;
  conditions: string;
  favorability: string;
  target_species: string;
  tackle: string;
  approach: string;
}

export interface DayPlan {
  summary: string;
  blocks: DayBlock[];
  best_window: string;
  notes: string;
}

export interface CandidateSpot {
  name: string;
  water_type: string;
  species: string[];
  why: string;
  access: string;
}

export interface ExploreResult {
  spots: CandidateSpot[];
  summary: string;
}

// ── Data fetchers ──

export async function fetchUserSpots(): Promise<SpotLite[]> {
  const { data, error } = await supabase
    .from("spots")
    .select(`id, name, body_of_water, state_code, site_type, spot_points(id, label, latitude, longitude), ${SPOT_TYPE_SELECT}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return flattenSpots(data) as unknown as SpotLite[];
}

export async function fetchPastInsights(spotId: string): Promise<PastInsights> {
  const { data: trips, error } = await supabase
    .from("fishing_trips")
    .select(`
      id, started_at, status,
      catches(species, length_in, tackle_id)
    `)
    .eq("spot_id", spotId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) return { totalTrips: 0, bestHours: [], topSpecies: [], topTackle: [], bestConditions: null };

  const allCatches = trips?.flatMap((t: any) => t.catches || []) || [];
  const speciesCount: Record<string, number> = {};
  const hourCount: Record<string, number> = {};
  const tackleCount: Record<string, number> = {};

  allCatches.forEach((c: any) => {
    if (c.species) speciesCount[c.species] = (speciesCount[c.species] || 0) + 1;
    if (c.tackle_id) tackleCount[c.tackle_id] = (tackleCount[c.tackle_id] || 0) + 1;
  });

  trips?.forEach((t: any) => {
    const d = new Date(t.started_at);
    const h = `${d.getHours()}:00`;
    const catchCount = (t.catches || []).length;
    if (catchCount > 0) hourCount[h] = (hourCount[h] || 0) + catchCount;
  });

  const topSpecies = Object.entries(speciesCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s);
  const bestHours = Object.entries(hourCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([h]) => h);
  const topTackleIds = Object.entries(tackleCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // Resolve tackle names
  let topTackle: string[] = [];
  if (topTackleIds.length) {
    const { data: tackleRows } = await supabase
      .from("tackle")
      .select("id, name")
      .in("id", topTackleIds);
    const nameMap: Record<string, string> = {};
    (tackleRows || []).forEach((t: any) => { nameMap[t.id] = t.name; });
    topTackle = topTackleIds.map(id => nameMap[id] || id).filter(Boolean);
  }

  return {
    totalTrips: trips?.length || 0,
    bestHours,
    topSpecies,
    topTackle,
    bestConditions: null,
  };
}

export async function fetchForecast(spot: SpotLite, date: string) {
  if (!spot.spot_points.length) return null;
  const { lat, lng } = spot.spot_points[0];

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/weather?lat=${lat}&lng=${lng}&date=${date}`;
  try {
    const resp = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function fetchWaterData(spot: SpotLite, date: string) {
  const siteId = spot.usgs_site_id;
  if (!siteId) return null;

  const dateStr = date;
  const { data: cached } = await supabase
    .from("water_data_cache")
    .select("response_json")
    .eq("monitoring_location_id", siteId)
    .eq("date", dateStr)
    .maybeSingle();

  if (cached?.response_json) return cached.response_json;

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/water-data?monitoring_location_id=${encodeURIComponent(siteId)}&date=${dateStr}`;
  try {
    const resp = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    if (!resp.ok) return null;
    const result = await resp.json();
    supabase
      .from("water_data_cache")
      .upsert(
        { monitoring_location_id: siteId, date: dateStr, response_json: result },
        { onConflict: "monitoring_location_id,date" }
      )
      .then(() => {});
    return result;
  } catch {
    return null;
  }
}

export async function fetchTideData(spot: SpotLite, date: string) {
  if (!spot.is_tidal || !spot.noaa_tide_station_id) return null;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/tide-water?station_id=${encodeURIComponent(spot.noaa_tide_station_id)}&date=${date}`;
  try {
    const resp = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function fetchUserTackle(): Promise<{ name: string; category: string | null; species: string[] }[]> {
  const { data, error } = await supabase
    .from("tackle")
    .select(`
      id, name,
      subcategory_id,
      tackle_subcategory(category_id),
      tackle_category(name),
      tackle_species(species(name))
    `)
    .order("name");
  if (error || !data) return [];

  return (data as any[]).map((t) => ({
    name: t.name,
    category: t.tackle_category?.name || t.tackle_subcategory?.[0]?.category_id || null,
    species: (t.tackle_species || []).map((ts: any) => ts.species?.name).filter(Boolean),
  }));
}

// ── AI calls ──

export async function parsePlannerVoice(transcript: string, context?: string): Promise<PlannerIntake> {
  const { data, error } = await supabase.functions.invoke("parse-planner-voice", {
    body: { transcript, context },
  });
  if (error) throw error;
  return data as PlannerIntake;
}

export async function generateDayPlan(params: {
  intake: PlannerIntake;
  spot: SpotLite;
  date: string;
  forecast: any;
  waterData: any;
  tideData: any;
  pastInsights: PastInsights;
  tackle: { name: string; category: string | null; species: string[] }[];
  refinement?: string;
}): Promise<DayPlan> {
  const { data, error } = await supabase.functions.invoke("plan-trip", {
    body: { mode: "plan", ...params },
  });
  if (error) throw error;
  return data as DayPlan;
}

export async function exploreArea(params: {
  intake: PlannerIntake;
  waterData?: { stations: any[] };
}): Promise<ExploreResult> {
  const { data, error } = await supabase.functions.invoke("plan-trip", {
    body: { mode: "explore", ...params },
  });
  if (error) throw error;
  return data as ExploreResult;
}

// ── Save ──

export async function savePlannedTrip(params: {
  spotId: string | null;
  date: string;
  planJson: DayPlan | ExploreResult;
  intake: PlannerIntake;
  forecastSnapshot: any;
}): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("fishing_trips")
    .insert({
      user_id: userData.user.id,
      spot_id: params.spotId,
      started_at: `${params.date}T06:00:00`,
      status: "planned",
      plan_json: params.planJson,
      forecast_snapshot: params.forecastSnapshot,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function convertPlannedToDraft(tripId: string): Promise<void> {
  const { error } = await supabase
    .from("fishing_trips")
    .update({ status: "draft" })
    .eq("id", tripId);
  if (error) throw error;
}
