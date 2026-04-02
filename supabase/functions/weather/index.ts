import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NWS_USER_AGENT = "CatchApp support@catchapp.com";
const NCEI_BASE = "https://www.ncei.noaa.gov/access/services";

// ── Helpers ──

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

function celsiusFromFahrenheit(f: number): number {
  return Math.round(((f - 32) * 5) / 9 * 10) / 10;
}

// ── NWS Fetch ──

async function nwsFetch(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
  });
  if (resp.status === 404) {
    throw Object.assign(new Error("NWS coverage not available for this location"), { status: 422, nws_coverage: false });
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw Object.assign(new Error(`NWS ${resp.status}: ${body}`), { status: 502 });
  }
  return resp.json();
}

// ── NCEI Fetch ──

async function nceiFetch(url: string, token: string): Promise<any> {
  const resp = await fetch(url, {
    headers: { token },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw Object.assign(new Error(`NCEI ${resp.status}: ${body}`), { status: 502 });
  }
  const text = await resp.text();
  if (!text.trim()) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

// ── Find nearest NCEI station ──

async function findNceiStation(lat: number, lon: number, token: string): Promise<string> {
  for (const radius of [0.5, 1.0]) {
    const bbox = `${(lat + radius).toFixed(4)},${(lon - radius).toFixed(4)},${(lat - radius).toFixed(4)},${(lon + radius).toFixed(4)}`;
    const url = `${NCEI_BASE}/search/v1/data?dataset=daily-summaries&bbox=${bbox}&limit=5`;
    try {
      const data = await nceiFetch(url, token);
      const results = data?.results || data;
      if (Array.isArray(results) && results.length > 0) {
        const stationId = results[0]?.stations?.[0]?.id || results[0]?.id;
        if (stationId) return stationId;
      }
    } catch (e) {
      console.warn(`NCEI station search failed (radius ${radius}):`, e);
    }
  }
  throw Object.assign(new Error("No NCEI station found near this location"), { status: 422, ncei_station_not_found: true });
}

// ── NCEI daily summaries ──

async function fetchNceiDaily(
  stationId: string,
  startDate: string,
  endDate: string,
  token: string
): Promise<any[]> {
  const url =
    `${NCEI_BASE}/data/v1?dataset=daily-summaries&stations=${stationId}` +
    `&startDate=${startDate}&endDate=${endDate}` +
    `&dataTypes=TAVG,TMAX,TMIN,PRCP,SNOW,AWND,WDF2,WSF2,WT01,WT02,WT03` +
    `&units=metric&format=json`;
  const data = await nceiFetch(url, token);
  return Array.isArray(data) ? data : [];
}

function mapNceiDay(record: any): any {
  const flags: string[] = [];
  if (record.WT01) flags.push("WT01"); // Fog
  if (record.WT02) flags.push("WT02"); // Heavy fog
  if (record.WT03) flags.push("WT03"); // Thunder

  return {
    date: record.DATE,
    source: "ncei_historical",
    summary: {
      temp_high_c: record.TMAX ?? null,
      temp_low_c: record.TMIN ?? null,
      temp_avg_c: record.TAVG ?? null,
      precip_mm: record.PRCP ?? null,
      snow_mm: record.SNOW ?? null,
      wind_speed_kmh: record.AWND != null ? Math.round(record.AWND * 3.6 * 10) / 10 : null,
      wind_direction_deg: record.WDF2 ?? null,
      conditions_flags: flags,
    },
  };
}

// ── NWS forecast parsing ──

function buildNwsSummary(periods: any[], date: string): any {
  const dayPeriods = periods.filter((p: any) => p.startTime?.startsWith(date));
  if (dayPeriods.length === 0) return null;

  const temps = dayPeriods.map((p: any) => p.temperature).filter((t: any) => t != null);
  const highF = Math.max(...temps);
  const lowF = Math.min(...temps);

  // Find the daytime period for conditions text
  const dayPeriod = dayPeriods.find((p: any) => p.isDaytime) || dayPeriods[0];

  return {
    temp_high_c: celsiusFromFahrenheit(highF),
    temp_low_c: celsiusFromFahrenheit(lowF),
    temp_avg_c: celsiusFromFahrenheit(Math.round((highF + lowF) / 2)),
    precip_mm: null, // NWS forecast doesn't give exact precip amounts
    wind_speed_kmh: dayPeriod?.windSpeed
      ? parseWindSpeed(dayPeriod.windSpeed)
      : null,
    wind_direction_deg: null,
    conditions: dayPeriod?.shortForecast || null,
    short_forecast: dayPeriod?.detailedForecast || dayPeriod?.shortForecast || null,
  };
}

function parseWindSpeed(windStr: string): number | null {
  // "10 mph" or "10 to 15 mph"
  const match = windStr.match(/(\d+)/);
  if (!match) return null;
  return Math.round(parseInt(match[1]) * 1.60934);
}

function buildNwsHourly(periods: any[], date: string): any[] {
  return periods
    .filter((p: any) => p.startTime?.startsWith(date))
    .map((p: any) => ({
      time: p.startTime,
      temp_c: celsiusFromFahrenheit(p.temperature),
      precip_probability_pct: p.probabilityOfPrecipitation?.value ?? null,
      wind_speed_kmh: p.windSpeed ? parseWindSpeed(p.windSpeed) : null,
      conditions: p.shortForecast || null,
    }));
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NCEI_TOKEN = Deno.env.get("NCEI_TOKEN");
    if (!NCEI_TOKEN) throw new Error("NCEI_TOKEN is not configured");

    const url = new URL(req.url);
    const latStr = url.searchParams.get("lat");
    const lonStr = url.searchParams.get("lon");
    const date = url.searchParams.get("date");

    if (!latStr || !lonStr || !date) {
      return new Response(
        JSON.stringify({ error: "lat, lon, and date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return new Response(
        JSON.stringify({ error: "Invalid lat/lon values" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ error: "date must be YYYY-MM-DD format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const todayStr = toDateStr(new Date());
    const maxForecastDate = addDays(todayStr, 7);
    const useForecast = date >= todayStr && date <= maxForecastDate;

    // ── Step 1: NWS points lookup for location metadata ──
    let city = null;
    let state = null;
    let forecastUrl = null;
    let forecastHourlyUrl = null;

    try {
      const pointsData = await nwsFetch(`https://api.weather.gov/points/${lat},${lon}`);
      const props = pointsData.properties;
      city = props?.relativeLocation?.properties?.city || null;
      state = props?.relativeLocation?.properties?.state || null;
      forecastUrl = props?.forecast || null;
      forecastHourlyUrl = props?.forecastHourly || null;
    } catch (e: any) {
      if (e.nws_coverage === false) {
        console.warn("NWS has no coverage for this location — using NCEI only");
      } else {
        console.warn("NWS points lookup failed:", e);
      }
    }

    // ── Step 2: Given day ──
    let givenDay: any = null;

    if (useForecast && forecastUrl && forecastHourlyUrl) {
      // Forecast path
      try {
        const [forecastData, hourlyData] = await Promise.all([
          nwsFetch(forecastUrl),
          nwsFetch(forecastHourlyUrl),
        ]);

        const summary = buildNwsSummary(forecastData.properties?.periods || [], date);
        const hourly = buildNwsHourly(hourlyData.properties?.periods || [], date);

        givenDay = {
          date,
          source: "nws_forecast",
          summary: summary || {},
          hourly,
        };
      } catch (e) {
        console.warn("NWS forecast fetch failed, falling back to NCEI:", e);
      }
    }

    // If forecast failed or date is historical, use NCEI
    let nceiStation: string | null = null;

    if (!givenDay) {
      try {
        nceiStation = await findNceiStation(lat, lon, NCEI_TOKEN);
        const records = await fetchNceiDaily(nceiStation, date, date, NCEI_TOKEN);
        if (records.length > 0) {
          const mapped = mapNceiDay(records[0]);
          givenDay = { ...mapped, hourly: [] };
        } else {
          givenDay = {
            date,
            source: "ncei_historical",
            summary: {},
            hourly: [],
            data_gaps: [date],
          };
        }
      } catch (e: any) {
        if (e.ncei_station_not_found) throw e;
        console.warn("NCEI given-day fetch failed:", e);
        givenDay = { date, source: "ncei_historical", summary: {}, hourly: [] };
      }
    }

    // ── Step 3: 10-day history (always NCEI) ──
    const historyStart = addDays(date, -10);
    const historyEnd = addDays(date, -1);
    let history: any[] = [];
    const dataGaps: string[] = [];

    try {
      if (!nceiStation) {
        nceiStation = await findNceiStation(lat, lon, NCEI_TOKEN);
      }
      const records = await fetchNceiDaily(nceiStation, historyStart, historyEnd, NCEI_TOKEN);
      history = records.map(mapNceiDay);

      // Check for gaps
      const returnedDates = new Set(history.map((h: any) => h.date));
      for (let i = -10; i <= -1; i++) {
        const d = addDays(date, i);
        if (!returnedDates.has(d)) dataGaps.push(d);
      }
    } catch (e: any) {
      if (e.ncei_station_not_found) throw e;
      console.warn("NCEI history fetch failed:", e);
    }

    const response: any = {
      location: { lat, lon, city, state },
      given_day: givenDay,
      history,
    };

    if (dataGaps.length > 0) {
      response.data_gaps = dataGaps;
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("weather error:", e);
    const status = e.status || 500;
    const body: any = { error: e.message || "Unknown error" };
    if (e.nws_coverage === false) body.nws_coverage = false;
    if (e.ncei_station_not_found) body.ncei_station_not_found = true;
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
