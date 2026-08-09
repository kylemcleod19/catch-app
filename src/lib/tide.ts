// Client helper for the NOAA tide-water edge function.
// The frontend never calls NOAA directly.

export interface TideEvent {
  t: string;
  height: number;
  type: "high" | "low";
}

export interface TideCurvePoint {
  t: string;
  height: number;
}

export interface ResolvedTideStation {
  available: boolean;
  product: string;
  stationId?: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
  distanceMiles?: number;
  nearestDistanceMiles?: number;
  maxDistanceMiles?: number;
  reason?: string;
}

export interface TideCurrent {
  height: number;
  direction: "incoming" | "outgoing" | "slack";
  rateFtPerHour: number;
  movementStrength: "strong" | "moderate" | "weak" | "slack";
  phase: string;
  nextEvent: { type: "high" | "low"; time: string; height: number; minutesAway: number } | null;
}

export interface TideWindowStats {
  startHeight: number;
  endHeight: number;
  netChangeFt: number;
  dominantDirection: "incoming" | "outgoing";
  percentIncoming: number;
  percentOutgoing: number;
  maxRateFtPerHour: number;
  crossedEvents: { type: "high" | "low"; time: string; height: number }[];
}

export interface TideResponse {
  mode: string;
  date: string;
  tideSource?: {
    stationId: string;
    stationName: string;
    lat: number;
    lon: number;
    distanceMiles: number;
    datum: string;
    units: string;
    timeZone: string;
  };
  stations: Record<string, ResolvedTideStation | null>;
  tides: {
    highs: TideEvent[];
    lows: TideEvent[];
    events: TideEvent[];
    curve: TideCurvePoint[];
    current: TideCurrent | null;
    tripWindow: TideWindowStats | null;
  } | null;
  forecastDays?: { date: string; events: TideEvent[] }[];
  supplementalWaterData: Record<string, any> | null;
  metadata: {
    predictionDataAvailable: boolean;
    curveDataAvailable: boolean;
    stationDistanceMiles?: number;
  };
  aiContext: unknown;
}

export type TideMode = "current_day" | "future_date" | "historical_trip";

export interface TideParams {
  lat: number;
  lon: number;
  mode?: TideMode;
  date?: string;
  days?: number;
  spotId?: string;
  start?: string;
  end?: string;
  resolveOnly?: boolean;
}

export async function fetchTideData(p: TideParams): Promise<TideResponse | null> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const qs = new URLSearchParams({
    lat: String(p.lat),
    lon: String(p.lon),
    mode: p.mode || "current_day",
  });
  if (p.date) qs.set("date", p.date);
  if (p.days) qs.set("days", String(p.days));
  if (p.spotId) qs.set("spot_id", p.spotId);
  if (p.start) qs.set("start", p.start);
  if (p.end) qs.set("end", p.end);
  if (p.resolveOnly) qs.set("resolve_only", "true");

  try {
    const resp = await fetch(
      `https://${projectId}.supabase.co/functions/v1/tide-water?${qs.toString()}`,
      { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
    );
    if (!resp.ok) return null;
    return (await resp.json()) as TideResponse;
  } catch {
    return null;
  }
}

export function formatTideTime(t: string) {
  // NOAA local time "YYYY-MM-DD HH:MM"
  const hhmm = t.slice(11, 16);
  const [hStr, m] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}
