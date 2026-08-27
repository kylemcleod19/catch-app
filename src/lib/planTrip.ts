import { supabase } from "@/integrations/supabase/client";
import { SPOT_TYPE_SELECT, createSpotTypeData, flattenSpots, flattenSpot, type SpotTypeData } from "./spotData";

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
  search_query?: string | null;
  water_type: string;
  species: string[];
  why: string;
  access: string;
  latitude?: number | null;
  longitude?: number | null;
  state_code?: string | null;
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
  const { latitude: lat, longitude: lng } = spot.spot_points[0];

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/weather?lat=${lat}&lon=${lng}&date=${date}`;
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
      plan_json: params.planJson as any,
      forecast_snapshot: params.forecastSnapshot as any,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/** Persist an AI-selected water immediately so the rest of planning can safely resume. */
export async function createCandidatePlannedTrip(params: {
  candidate: CandidateSpot;
  date: string;
  details: ChatDetails | null;
}): Promise<{ spot: SpotLite; tripId: string }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not authenticated");
  const { candidate, date, details } = params;
  if (typeof candidate.latitude !== "number" || typeof candidate.longitude !== "number") {
    throw new Error("That location could not be mapped. Please choose another spot.");
  }

  const siteType = candidate.water_type === "tidal" ? "Tidal" : candidate.water_type === "lake" ? "Lake" : "Stream";
  const stateFromQuery = candidate.search_query?.match(/,\s*([A-Z]{2})(?:\s|$)/)?.[1];
  const stateCode = toFipsStateCode(candidate.state_code?.trim() || stateFromQuery) || "US";
  const { data: spotRow, error: spotError } = await supabase
    .from("spots")
    .insert({
      user_id: userData.user.id,
      name: candidate.name,
      body_of_water: candidate.name,
      state_code: stateCode,
      site_type: siteType,
    })
    .select("id, name, body_of_water, state_code, site_type")
    .single();
  if (spotError) throw spotError;

  const point = { id: crypto.randomUUID(), label: "Primary access", latitude: candidate.latitude, longitude: candidate.longitude };
  try {
    const { error: pointError } = await supabase.from("spot_points").insert({
      id: point.id,
      spot_id: spotRow.id,
      label: point.label,
      latitude: point.latitude,
      longitude: point.longitude,
    });
    if (pointError) throw pointError;
    const { error: typeError } = await createSpotTypeData(spotRow.id, siteType, {});
    if (typeError) throw typeError;

    const { data: trip, error: tripError } = await supabase
      .from("fishing_trips")
      .insert({
        user_id: userData.user.id,
        spot_id: spotRow.id,
        started_at: `${date}T06:00:00`,
        status: "planned",
        plan_json: { stage: "equipment", candidate, details: details || {} } as any,
      })
      .select("id")
      .single();
    if (tripError) throw tripError;

    return {
      tripId: trip.id,
      spot: flattenSpot({
        ...spotRow,
        spot_points: [point],
        spot_stream_data: siteType === "Stream" ? [{ usgs_site_id: null }] : [],
        spot_lake_data: siteType === "Lake" ? [{ usgs_site_id: null }] : [],
        spot_tidal_data: siteType === "Tidal" ? [{}] : [],
      }) as SpotLite,
    };
  } catch (error) {
    await supabase.from("spots").delete().eq("id", spotRow.id);
    throw error;
  }
}

export async function updatePlannedTrip(params: {
  tripId: string;
  date: string;
  planJson: DayPlan;
  forecastSnapshot: any;
}): Promise<void> {
  const { error } = await supabase
    .from("fishing_trips")
    .update({
      started_at: `${params.date}T06:00:00`,
      plan_json: params.planJson as any,
      forecast_snapshot: params.forecastSnapshot as any,
    })
    .eq("id", params.tripId);
  if (error) throw error;
}

// ── Conversational planner ──

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatDetails {
  location?: string;
  water_type?: string;
  body_of_water?: string;
  species?: string[];
  vessel?: string;
  method?: string;
  tackle?: string[];
  date?: string;
  time_available?: string;
}

export interface ChatTurn {
  reply: string;
  details: ChatDetails | null;
  spots: ExploreResult | null;
  planRequest: { spot_id: string; date: string; reason?: string } | null;
}

export async function planChat(params: {
  messages: ChatMessage[];
  context: {
    today: string;
    spots: { id: string; name: string | null; body_of_water: string; state_code: string; site_type: string }[];
    species: string[];
    tackle: { name: string; category: string | null; species: string[] }[];
    details?: ChatDetails | null;
  };
}): Promise<ChatTurn> {
  const { data, error } = await supabase.functions.invoke("plan-chat", { body: params });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as ChatTurn;
}

/** Chat details → the intake shape the day-plan function expects. */
export function detailsToIntake(d: ChatDetails | null): PlannerIntake {
  return {
    vessel: d?.vessel || null,
    species: d?.species || [],
    method: d?.method || null,
    time_available: d?.time_available || null,
    travel_distance: null,
    date: d?.date || null,
    location_query: d?.location || d?.body_of_water || null,
    notes: null,
  };
}

/** Fetch all conditions for a spot/date and generate the grounded day plan. */
export async function buildDayPlan(params: {
  spot: SpotLite;
  date: string;
  intake: PlannerIntake;
  refinement?: string;
}): Promise<DayPlan> {
  const { spot, date, intake, refinement } = params;
  const [forecast, waterData, tideData, tackle, pastInsights] = await Promise.all([
    fetchForecast(spot, date).catch(() => null),
    fetchWaterData(spot, date).catch(() => null),
    fetchTideData(spot, date).catch(() => null),
    fetchUserTackle().catch(() => []),
    fetchPastInsights(spot.id).catch(() => ({
      totalTrips: 0, bestHours: [], topSpecies: [], topTackle: [], bestConditions: null,
    })),
  ]);

  return generateDayPlan({ intake, spot, date, forecast, waterData, tideData, pastInsights, tackle, refinement });
}

export async function convertPlannedToDraft(tripId: string): Promise<void> {
  const { error } = await supabase
    .from("fishing_trips")
    .update({ status: "draft" })
    .eq("id", tripId);
  if (error) throw error;
}
