import { supabase } from "@/integrations/supabase/client";

export interface FlowPoint {
  date: string;
  value: number;
}

export interface ClaritySummary {
  /** Latest observed discharge in cfs */
  latest: number | null;
  /** 30-day median discharge in cfs */
  median: number | null;
  /** Percent change over the last 3 days of record */
  changePct: number | null;
  label: string;
  detail: string;
  tone: "clear" | "stained" | "muddy" | "low" | "unknown";
}

/** Pull the cached (or fresh) USGS payload for a site and return the 30-day discharge / gage series. */
export async function fetchFlowSeries(
  usgsSiteId: string,
): Promise<{ discharge: FlowPoint[]; gage: FlowPoint[] }> {
  const dateStr = new Date().toISOString().split("T")[0];
  let result: any = null;

  const { data: cached } = await supabase
    .from("water_data_cache")
    .select("response_json")
    .eq("monitoring_location_id", usgsSiteId)
    .eq("date", dateStr)
    .maybeSingle();

  if (cached?.response_json) {
    result = cached.response_json;
  } else {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/water-data?monitoring_location_id=${encodeURIComponent(
      usgsSiteId,
    )}&date=${dateStr}`;
    const resp = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    if (!resp.ok) throw new Error("Water data unavailable");
    result = await resp.json();
    supabase
      .from("water_data_cache")
      .upsert(
        { monitoring_location_id: usgsSiteId, date: dateStr, response_json: result },
        { onConflict: "monitoring_location_id,date" },
      )
      .then(() => {});
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const mapSeries = (arr: any[] = []): FlowPoint[] =>
    arr
      .map((p) => ({ date: p.date || "", value: parseFloat(p.value) }))
      .filter((d) => d.date && !isNaN(d.value) && new Date(d.date) >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));

  return {
    discharge: mapSeries(result?.historical?.discharge?.series),
    gage: mapSeries(result?.historical?.gage_height?.series),
  };
}

/**
 * Rough water-clarity read from recent discharge behaviour. Rising or well
 * above-median flows push sediment; steady low flows usually run clear.
 */
export function summarizeClarity(discharge: FlowPoint[]): ClaritySummary {
  if (discharge.length < 2) {
    return {
      latest: discharge[0]?.value ?? null,
      median: null,
      changePct: null,
      label: "Unknown",
      detail: "Not enough recent flow data to estimate clarity.",
      tone: "unknown",
    };
  }

  const values = discharge.map((d) => d.value);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const latest = values[values.length - 1];
  const priorIdx = Math.max(0, values.length - 4);
  const prior = values[priorIdx];
  const changePct = prior > 0 ? ((latest - prior) / prior) * 100 : null;
  const ratio = median > 0 ? latest / median : 1;

  let label = "Likely clear";
  let tone: ClaritySummary["tone"] = "clear";
  let detail = "Flows are steady near the monthly norm — expect fishable clarity.";

  if (changePct != null && changePct > 60) {
    label = "Likely muddy";
    tone = "muddy";
    detail = `Flow is up ${Math.round(changePct)}% over the last few days — fresh runoff usually means stained to muddy water.`;
  } else if (ratio > 1.8) {
    label = "Likely stained";
    tone = "stained";
    detail = `Running about ${ratio.toFixed(1)}× the 30-day median — expect colored water and pushed-out fish.`;
  } else if (changePct != null && changePct > 20) {
    label = "Likely stained";
    tone = "stained";
    detail = `Flow is rising (${Math.round(changePct)}% in the last few days) — clarity is probably dropping.`;
  } else if (ratio < 0.6) {
    label = "Clear and low";
    tone = "low";
    detail = "Flow is well below the monthly median — clear, skinny water, so fish light and stay back.";
  } else if (changePct != null && changePct < -25) {
    label = "Clearing";
    tone = "clear";
    detail = `Flow is dropping (${Math.round(Math.abs(changePct))}% in the last few days) — water should be cleaning up.`;
  }

  return { latest, median, changePct, label, detail, tone };
}
