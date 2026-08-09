import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COOPS_DATA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const COOPS_META = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi";
const APP = "CatchApp";

// Per-product maximum station distance (miles)
const MAX_DISTANCE_MILES: Record<string, number> = {
  tide_predictions: 25,
  water_level: 10,
  water_temperature: 5,
  salinity: 5,
  currents: 5,
  meteorological: 15,
};

const STATION_TYPE_ENDPOINT: Record<string, string> = {
  tide_predictions: "stations.json?type=tidepredictions",
  water_level: "stations.json?type=waterlevels",
  water_temperature: "stations.json?type=watertemp",
  salinity: "stations.json?type=salinity",
  currents: "stations.json?type=currentpredictions",
  meteorological: "stations.json?type=met",
};

// ── helpers ──
function haversineMiles(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const mem = new Map<string, { data: unknown; expires: number }>();
function memGet(k: string) {
  const e = mem.get(k);
  if (!e) return null;
  if (Date.now() > e.expires) {
    mem.delete(k);
    return null;
  }
  return e.data;
}
function memSet(k: string, data: unknown, ttlMs: number) {
  mem.set(k, { data, expires: Date.now() + ttlMs });
}

function ymd(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function dashToCompact(date: string) {
  return date.replaceAll("-", "");
}
function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── station lists (cached in memory per instance) ──
async function stationList(product: string): Promise<any[]> {
  const key = `stations:${product}`;
  const cached = memGet(key) as any[] | null;
  if (cached) return cached;
  const endpoint = STATION_TYPE_ENDPOINT[product];
  if (!endpoint) return [];
  const resp = await fetch(`${COOPS_META}/${endpoint}&application=${APP}`);
  if (!resp.ok) throw new Error(`NOAA station metadata ${resp.status}`);
  const json = await resp.json();
  const stations = (json?.stations || []).filter(
    (s: any) => typeof s.lat === "number" && typeof s.lng === "number",
  );
  memSet(key, stations, 24 * 3600_000);
  return stations;
}

async function resolveStation(product: string, lat: number, lon: number) {
  let stations: any[] = [];
  try {
    stations = await stationList(product);
  } catch (e) {
    console.warn(`station list failed for ${product}`, e);
    return null;
  }
  let best: any = null;
  let bestDist = Infinity;
  for (const s of stations) {
    const d = haversineMiles(lat, lon, s.lat, s.lng);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  if (!best) return null;
  const max = MAX_DISTANCE_MILES[product] ?? 25;
  if (bestDist > max) {
    return {
      available: false,
      reason: "no_station_within_range",
      product,
      nearestDistanceMiles: Math.round(bestDist * 10) / 10,
      maxDistanceMiles: max,
    };
  }
  return {
    available: true,
    product,
    stationId: String(best.id),
    stationName: best.name ? `${best.name}${best.state ? ", " + best.state : ""}` : String(best.id),
    stationLat: best.lat,
    stationLon: best.lng,
    distanceMiles: Math.round(bestDist * 10) / 10,
    maxDistanceMiles: max,
  };
}

/** Nearest N stations for a product, regardless of the max-distance threshold. */
async function nearbyStations(product: string, lat: number, lon: number, limit: number) {
  let stations: any[] = [];
  try {
    stations = await stationList(product);
  } catch (e) {
    console.warn(`station list failed for ${product}`, e);
    return [];
  }
  return stations
    .map((s: any) => ({
      product,
      stationId: String(s.id),
      stationName: s.name ? `${s.name}${s.state ? ", " + s.state : ""}` : String(s.id),
      stationLat: s.lat,
      stationLon: s.lng,
      distanceMiles: Math.round(haversineMiles(lat, lon, s.lat, s.lng) * 10) / 10,
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, limit);
}


// ── NOAA data fetch ──
async function coops(params: Record<string, string>) {
  const url = new URL(COOPS_DATA);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("format", "json");
  url.searchParams.set("application", APP);
  const key = url.toString();
  const cached = memGet(key);
  if (cached) return cached as any;
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`NOAA ${resp.status}`);
  const json = await resp.json();
  if (json?.error) throw new Error(json.error.message || "NOAA error");
  memSet(key, json, 900_000);
  return json;
}

async function fetchPredictions(stationId: string, date: string) {
  const begin = dashToCompact(date);
  const end = begin;
  const common = {
    station: stationId,
    product: "predictions",
    datum: "MLLW",
    time_zone: "lst_ldt",
    units: "english",
    begin_date: begin,
    end_date: end,
  };
  let highsLows: any[] = [];
  let curve: any[] = [];
  try {
    const hl = await coops({ ...common, interval: "hilo" });
    highsLows = hl?.predictions || [];
  } catch (e) {
    console.warn("hilo failed", e);
  }
  try {
    const c = await coops({ ...common, interval: "15" } as any);
    curve = c?.predictions || [];
  } catch (e) {
    console.warn("curve failed", e);
  }
  return { highsLows, curve };
}

async function fetchObservation(stationId: string, product: string, date: string, todayIso: string) {
  // Observations only exist for past/present dates
  if (date > todayIso) return null;
  const begin = dashToCompact(date);
  try {
    const json = await coops({
      station: stationId,
      product,
      datum: "MLLW",
      time_zone: "lst_ldt",
      units: "english",
      begin_date: begin,
      end_date: begin,
    });
    return json?.data || null;
  } catch (e) {
    console.warn(`observation ${product} failed`, e);
    return null;
  }
}

// ── derivations ──
function parseLocal(t: string) {
  // NOAA "YYYY-MM-DD HH:MM" in station local time
  return new Date(t.replace(" ", "T") + ":00");
}

function normalizeCurve(curve: any[]) {
  return curve
    .map((p) => ({ t: p.t, height: parseFloat(p.v) }))
    .filter((p) => !isNaN(p.height));
}

function normalizeHilo(hl: any[]) {
  return hl
    .map((p) => ({ t: p.t, height: parseFloat(p.v), type: p.type === "H" ? "high" : "low" }))
    .filter((p) => !isNaN(p.height));
}

function classifyStrength(rate: number, range: number) {
  const r = Math.abs(rate);
  if (range <= 0) return r > 1 ? "strong" : r > 0.4 ? "moderate" : r > 0.1 ? "weak" : "slack";
  const norm = r / (range / 6); // typical max rate ~ range/6 per hour
  if (norm >= 0.85) return "strong";
  if (norm >= 0.45) return "moderate";
  if (norm >= 0.15) return "weak";
  return "slack";
}

function deriveAt(curve: { t: string; height: number }[], hilo: any[], atMs: number) {
  if (curve.length < 2) return null;
  let idx = -1;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = parseLocal(curve[i].t).getTime();
    const b = parseLocal(curve[i + 1].t).getTime();
    if (atMs >= a && atMs <= b) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return null;
  const a = curve[idx];
  const b = curve[idx + 1];
  const aMs = parseLocal(a.t).getTime();
  const bMs = parseLocal(b.t).getTime();
  const frac = bMs === aMs ? 0 : (atMs - aMs) / (bMs - aMs);
  const height = a.height + (b.height - a.height) * frac;
  const rate = ((b.height - a.height) / ((bMs - aMs) / 3600_000));
  const heights = curve.map((c) => c.height);
  const range = Math.max(...heights) - Math.min(...heights);
  const direction = rate > 0.02 ? "incoming" : rate < -0.02 ? "outgoing" : "slack";
  const next = hilo
    .map((h) => ({ ...h, ms: parseLocal(h.t).getTime() }))
    .filter((h) => h.ms >= atMs)
    .sort((x, y) => x.ms - y.ms)[0];
  let phase: string = "slack";
  if (next) phase = next.type === "high" ? "approaching_high" : "approaching_low";
  return {
    height: Math.round(height * 100) / 100,
    direction,
    rateFtPerHour: Math.round(rate * 100) / 100,
    movementStrength: classifyStrength(rate, range),
    phase,
    nextEvent: next
      ? { type: next.type, time: next.t, height: next.height, minutesAway: Math.round((next.ms - atMs) / 60000) }
      : null,
  };
}

function tripWindowStats(curve: { t: string; height: number }[], hilo: any[], startMs: number, endMs: number) {
  const pts = curve
    .map((c) => ({ ...c, ms: parseLocal(c.t).getTime() }))
    .filter((c) => c.ms >= startMs && c.ms <= endMs);
  if (pts.length < 2) return null;
  let incoming = 0;
  let outgoing = 0;
  let maxRate = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dh = pts[i + 1].height - pts[i].height;
    const dt = (pts[i + 1].ms - pts[i].ms) / 3600_000;
    if (dt <= 0) continue;
    const rate = dh / dt;
    if (Math.abs(rate) > Math.abs(maxRate)) maxRate = rate;
    if (dh > 0) incoming += dt;
    else outgoing += dt;
  }
  const total = incoming + outgoing || 1;
  const crossed = hilo.filter((h) => {
    const ms = parseLocal(h.t).getTime();
    return ms >= startMs && ms <= endMs;
  });
  return {
    startHeight: Math.round(pts[0].height * 100) / 100,
    endHeight: Math.round(pts[pts.length - 1].height * 100) / 100,
    netChangeFt: Math.round((pts[pts.length - 1].height - pts[0].height) * 100) / 100,
    dominantDirection: incoming >= outgoing ? "incoming" : "outgoing",
    percentIncoming: Math.round((incoming / total) * 100),
    percentOutgoing: Math.round((outgoing / total) * 100),
    maxRateFtPerHour: Math.round(maxRate * 100) / 100,
    crossedEvents: crossed.map((h) => ({ type: h.type, time: h.t, height: h.height })),
  };
}

function buildAiContext(date: string, hilo: any[], now: any, stats: any) {
  const events = hilo.map((h) => `${h.type} ${h.t.slice(11)} ${h.height.toFixed(1)}ft`).join(", ");
  const parts = [`Date ${date}.`];
  if (events) parts.push(`Tides: ${events}.`);
  if (now) parts.push(`Now ${now.height}ft, ${now.direction}, ${now.movementStrength} movement.`);
  if (stats) parts.push(`Trip window: ${stats.dominantDirection}, net ${stats.netChangeFt}ft.`);
  return { summary: parts.join(" "), events: hilo, current: now, tripWindow: stats };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "current_day";
    const lat = parseFloat(url.searchParams.get("lat") || "");
    const lon = parseFloat(url.searchParams.get("lon") || "");
    const spotId = url.searchParams.get("spot_id");
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const startIso = url.searchParams.get("start");
    const endIso = url.searchParams.get("end");
    const days = Math.min(parseInt(url.searchParams.get("days") || "1", 10) || 1, 7);
    const resolveOnly = url.searchParams.get("resolve_only") === "true";
    const listStations = url.searchParams.get("list_stations") === "true";

    if (isNaN(lat) || isNaN(lon)) {
      return new Response(JSON.stringify({ error: "lat and lon are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (listStations) {
      const product = url.searchParams.get("product") || "tide_predictions";
      if (!(product in NOAA_STATION_ENDPOINTS)) {
        return new Response(JSON.stringify({ error: "unknown product" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "12", 10) || 12, 1), 50);
      const list = await nearbyStations(product, lat, lon, limit);
      return new Response(JSON.stringify({ stations: list }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const products = ["tide_predictions", "water_level", "water_temperature", "currents", "meteorological"];
    const stations: Record<string, any> = {};
    for (const p of products) {
      stations[p] = await resolveStation(p, lat, lon);
    }

    // Persist resolved stations for the spot when we have one
    if (spotId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const rows = Object.values(stations)
          .filter((s: any) => s?.available)
          .map((s: any) => ({
            spot_id: spotId,
            product: s.product,
            station_id: s.stationId,
            station_name: s.stationName,
            station_lat: s.stationLat,
            station_lon: s.stationLon,
            distance_miles: s.distanceMiles,
          }));
        if (rows.length) {
          await supabase.from("noaa_station_products").upsert(rows, { onConflict: "spot_id,product" });
        }
        const tide = stations.tide_predictions;
        if (tide?.available) {
          await supabase.from("spots").update({ site_type: "Tidal" }).eq("id", spotId);
          await supabase.from("spot_tidal_data").upsert(
            {
              spot_id: spotId,
              noaa_tide_station_id: tide.stationId,
              noaa_station_name: tide.stationName,
              noaa_station_lat: tide.stationLat,
              noaa_station_lon: tide.stationLon,
              noaa_station_distance_miles: tide.distanceMiles,
            },
            { onConflict: "spot_id" },
          );
        }

      } catch (e) {
        console.warn("station persistence failed", e);
      }
    }

    if (resolveOnly) {
      return new Response(JSON.stringify({ stations }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tideStation = stations.tide_predictions;
    if (!tideStation?.available) {
      return new Response(
        JSON.stringify({
          mode,
          date,
          stations,
          tides: null,
          metadata: { predictionDataAvailable: false, curveDataAvailable: false },
          supplementalWaterData: null,
          aiContext: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const dayList = Array.from({ length: days }, (_, i) => addDays(date, i));

    const perDay: any[] = [];
    for (const d of dayList) {
      const { highsLows, curve } = await fetchPredictions(tideStation.stationId, d);
      perDay.push({
        date: d,
        highs: normalizeHilo(highsLows).filter((h) => h.type === "high"),
        lows: normalizeHilo(highsLows).filter((h) => h.type === "low"),
        events: normalizeHilo(highsLows),
        curve: normalizeCurve(curve),
      });
    }

    const primary = perDay[0];
    const nowMs = Date.now();
    const current =
      mode === "current_day" && date === todayIso
        ? deriveAt(primary.curve, primary.events, nowMs)
        : null;

    let windowStats: any = null;
    if (startIso && endIso) {
      const s = new Date(startIso).getTime();
      const e = new Date(endIso).getTime();
      if (!isNaN(s) && !isNaN(e) && e > s) {
        windowStats = tripWindowStats(primary.curve, primary.events, s, e);
      }
    }

    // Supplemental observations (Phase 3) — only for current/historical dates
    let supplemental: any = null;
    if (mode !== "future_date" && date <= todayIso) {
      const obs: any = {};
      const wl = stations.water_level;
      if (wl?.available) {
        const rows = await fetchObservation(wl.stationId, "water_level", date, todayIso);
        obs.observedWaterLevel = rows?.length
          ? { value: parseFloat(rows[rows.length - 1].v), unit: "ft", station: wl }
          : { value: null, unit: "ft", station: wl, available: false };
      }
      const wt = stations.water_temperature;
      if (wt?.available) {
        const rows = await fetchObservation(wt.stationId, "water_temperature", date, todayIso);
        obs.waterTemperature = rows?.length
          ? { value: parseFloat(rows[rows.length - 1].v), unit: "F", station: wt }
          : { value: null, unit: "F", station: wt, available: false };
      }
      const met = stations.meteorological;
      if (met?.available) {
        const rows = await fetchObservation(met.stationId, "wind", date, todayIso);
        obs.wind = rows?.length
          ? { speed: parseFloat(rows[rows.length - 1].s), direction: rows[rows.length - 1].dr, unit: "mph", station: met }
          : { speed: null, unit: "mph", station: met, available: false };
      }
      const cur = stations.currents;
      if (cur?.available) obs.currents = { station: cur, value: null, available: false };
      supplemental = Object.keys(obs).length ? obs : null;
    }

    const response = {
      mode,
      date,
      tideSource: {
        stationId: tideStation.stationId,
        stationName: tideStation.stationName,
        lat: tideStation.stationLat,
        lon: tideStation.stationLon,
        distanceMiles: tideStation.distanceMiles,
        datum: "MLLW",
        units: "english",
        timeZone: "lst_ldt",
      },
      stations,
      tides: {
        highs: primary.highs,
        lows: primary.lows,
        events: primary.events,
        curve: primary.curve,
        current,
        tripWindow: windowStats,
      },
      forecastDays: perDay.map((d) => ({ date: d.date, events: d.events })),
      supplementalWaterData: supplemental,
      metadata: {
        predictionDataAvailable: primary.events.length > 0,
        curveDataAvailable: primary.curve.length > 0,
        stationDistanceMiles: tideStation.distanceMiles,
      },
      aiContext: buildAiContext(date, primary.events, current, windowStats),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("tide-water error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: e.status || 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
