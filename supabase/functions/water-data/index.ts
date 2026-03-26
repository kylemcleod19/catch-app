import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USGS_BASE = "https://api.waterdata.usgs.gov/ogcapi/v0";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expires: number }>();

function cacheGet(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key: string, data: unknown, ttlMs: number) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

// ── USGS fetch with retry on 429 ──
async function usgsGet(path: string, params: Record<string, string>, apiKey: string): Promise<any> {
  const url = new URL(`${USGS_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("f", "json");
  // Note: USGS API works without api_key for basic queries; adding it can cause 403

  const cacheKey = url.toString();
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const resp = await fetch(url.toString());

    if (resp.status === 429) {
      const wait = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`USGS 429 — retrying in ${wait}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, wait));
      lastErr = new Error("USGS rate limited (429)");
      continue;
    }

    if (resp.status === 403) {
      throw Object.assign(new Error("USGS upstream auth error"), { status: 502 });
    }

    if (!resp.ok) {
      const body = await resp.text();
      throw Object.assign(new Error(`USGS ${resp.status}: ${body}`), { status: 502 });
    }

    const data = await resp.json();

    // Determine TTL based on request type
    const isToday = params.time && !params.time.includes("/");
    const isMetadata = path.includes("time-series-metadata");
    const ttl = isMetadata ? 3600_000 : isToday ? 900_000 : 86400_000;
    cacheSet(cacheKey, data, ttl);

    return data;
  }

  throw Object.assign(lastErr || new Error("USGS request failed after retries"), { status: 503 });
}

// ── Stats calculator ──
function computeStats(values: number[]) {
  const nums = values.filter((v) => v !== null && !isNaN(v));
  if (nums.length === 0) return null;

  nums.sort((a, b) => a - b);
  const n = nums.length;
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;

  const percentile = (p: number) => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? nums[lo] : nums[lo] + (nums[hi] - nums[lo]) * (idx - lo);
  };

  return {
    mean: Math.round(mean * 100) / 100,
    min: nums[0],
    max: nums[n - 1],
    median: percentile(50),
    p10: percentile(10),
    p25: percentile(25),
    p75: percentile(75),
    p90: percentile(90),
    std_dev: Math.round(Math.sqrt(variance) * 100) / 100,
    count: n,
  };
}

// ── Build time interval string ──
function buildInterval(endDate: string, days: number): string {
  const end = new Date(endDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return `${start.toISOString().split(".")[0]}Z/${end.toISOString().split(".")[0]}Z`;
}

// ── Fetch historical for a parameter with fallback ──
async function fetchHistorical(
  monId: string,
  paramCodes: string[],
  statisticId: string,
  interval: string,
  apiKey: string
): Promise<{ features: any[]; paramUsed: string | null }> {
  for (const code of paramCodes) {
    try {
      const data = await usgsGet("/collections/daily/items", {
        monitoring_location_id: monId,
        parameter_code: code,
        statistic_id: statisticId,
        time: interval,
        limit: "50000",
      });
      const features = data?.features || [];
      if (features.length > 0) return { features, paramUsed: code };
    } catch (e) {
      console.warn(`Historical fetch failed for param ${code}:`, e);
    }
  }
  return { features: [], paramUsed: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const USGS_API_KEY = Deno.env.get("USGS_API_KEY");
    if (!USGS_API_KEY) throw new Error("USGS_API_KEY is not configured");

    const url = new URL(req.url);
    const monId = url.searchParams.get("monitoring_location_id");
    const date = url.searchParams.get("date");

    if (!monId) {
      return new Response(JSON.stringify({ error: "monitoring_location_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default to today if no date
    const targetDate = date || new Date().toISOString().split("T")[0];
    const interval100 = buildInterval(targetDate, 100);

    // Sequential calls to avoid USGS 403 on concurrent requests
    let dailyData: any = null;
    let dischargeData = { features: [] as any[], paramUsed: null as string | null };
    let gageData = { features: [] as any[], paramUsed: null as string | null };
    let metadataData: any = null;

    try {
      dailyData = await usgsGet("/collections/daily/items", {
        monitoring_location_id: monId,
        time: targetDate,
        limit: "1000",
      }, USGS_API_KEY);
    } catch (e) { console.warn("Daily fetch failed:", e); }

    try {
      dischargeData = await fetchHistorical(monId, ["00060"], "00003", interval100, USGS_API_KEY);
    } catch (e) { console.warn("Discharge fetch failed:", e); }

    try {
      gageData = await fetchHistorical(monId, ["62615", "00065"], "00003", interval100, USGS_API_KEY);
    } catch (e) { console.warn("Gage fetch failed:", e); }

    try {
      metadataData = await usgsGet("/collections/time-series-metadata/items", {
        monitoring_location_id: monId,
        limit: "50000",
      }, USGS_API_KEY);
    } catch (e) { console.warn("Metadata fetch failed:", e); }

    // ── Daily values ──
    const dailyFeatures = dailyData?.features || [];
    const dailyValues = dailyFeatures.map((f: any) => ({
      parameter_code: f.properties?.parameter_code,
      parameter_name: f.properties?.parameter_name,
      statistic_id: f.properties?.statistic_id,
      statistic_description: f.properties?.statistic_description,
      value: f.properties?.value,
      unit: f.properties?.unit_of_measure,
      date: f.properties?.time,
      approval_status: f.properties?.approval_status,
    }));

    // ── Historical discharge ──
    const dischargeSeries = dischargeData.features.map((f: any) => ({
      date: f.properties?.time,
      value: f.properties?.value,
    }));

    // ── Historical gage height ──
    const gageSeries = gageData.features.map((f: any) => ({
      date: f.properties?.time,
      value: f.properties?.value,
    }));

    // ── Metadata ──
    const metadataFeatures = metadataData?.features || [];
    const metadata = metadataFeatures.map((f: any) => ({
      parameter_code: f.properties?.parameter_code,
      parameter_name: f.properties?.parameter_name,
      statistic_id: f.properties?.statistic_id,
      begin_date: f.properties?.begin_date,
      end_date: f.properties?.end_date,
      thresholds: f.properties?.thresholds || null,
    }));

    // ── Computed stats (USGS returns values as strings) ──
    const dischargeValues = dischargeSeries.map((d: any) => parseFloat(d.value)).filter((v: number) => !isNaN(v));
    const gageValues = gageSeries.map((d: any) => parseFloat(d.value)).filter((v: number) => !isNaN(v));

    const response = {
      monitoring_location_id: monId,
      date: targetDate,
      daily_values: dailyValues,
      historical: {
        discharge: {
          parameter_code: dischargeData.paramUsed,
          series: dischargeSeries,
        },
        gage_height: {
          parameter_code: gageData.paramUsed,
          series: gageSeries,
        },
      },
      statistics: {
        metadata,
        computed: {
          discharge: computeStats(dischargeValues),
          gage_height: computeStats(gageValues),
        },
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("water-data error:", e);
    const status = e.status || 500;
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
