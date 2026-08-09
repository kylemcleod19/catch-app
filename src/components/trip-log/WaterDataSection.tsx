import { forwardRef, useEffect, useState } from "react";
import { Droplets, Loader2, ChevronDown, Activity, Ruler } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { niceGridLines } from "@/lib/chartGrid";

import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot } from "recharts";

interface DailyValue {
  parameter_code: string;
  parameter_name?: string;
  statistic_id: string;
  value: string;
  unit: string;
  date: string;
  approval_status?: string;
}

interface HistoricalPoint {
  date: string;
  value: string;
}

interface ComputedStats {
  mean?: number;
  min?: number;
  max?: number;
  median?: number;
  p10?: number;
  p25?: number;
  p75?: number;
  p90?: number;
  count?: number;
}

export interface WaterFlowSnapshot {
  monitoring_location_id: string;
  monitoring_location_name?: string;
  date: string;
  fetched_at: string;
  daily_values: DailyValue[];
  historical?: {
    discharge?: { parameter_code?: string | null; series?: HistoricalPoint[] };
    gage_height?: { parameter_code?: string | null; series?: HistoricalPoint[] };
  };
  statistics?: {
    computed?: {
      discharge?: ComputedStats;
      gage_height?: ComputedStats;
    };
  };
}

interface WaterDataSectionProps {
  spotId: string | null;
  date: Date;
  existingSnapshot: WaterFlowSnapshot | null;
  onSnapshotChange: (snapshot: WaterFlowSnapshot | null) => void;
}

function getParamIcon(code: string) {
  if (code === "00060") return <Activity className="w-3.5 h-3.5 text-primary" />;
  return <Ruler className="w-3.5 h-3.5 text-accent" />;
}

function RangeBar({ value, p10, p90 }: { value: number; p10: number; p90: number }) {
  const range = p90 - p10;
  if (range <= 0) return null;
  const pct = Math.max(0, Math.min(100, ((value - p10) / range) * 100));

  return (
    <div className="relative w-12 h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="absolute top-0 left-0 h-full rounded-full bg-primary/70"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function hasWaterContent(snapshot: WaterFlowSnapshot | null): boolean {
  if (!snapshot) return false;

  const hasHistorical =
    (snapshot.historical?.discharge?.series?.length || 0) > 0 ||
    (snapshot.historical?.gage_height?.series?.length || 0) > 0;

  // Require historical so older snapshots (saved before historical was added)
  // get refreshed from cache/API and gain the 100-day chart data.
  return snapshot.daily_values.length > 0 && hasHistorical;
}

const WaterDataSection = forwardRef<HTMLDivElement, WaterDataSectionProps>(({ spotId, date, existingSnapshot, onSnapshotChange }, ref) => {
  const [loading, setLoading] = useState(false);
  const [usgsSiteId, setUsgsSiteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!spotId) {
      setUsgsSiteId(null);
      onSnapshotChange(null);
      return;
    }

    getSpotUsgsSiteId(spotId).then((siteId) => {
      setUsgsSiteId(siteId);
      if (!siteId) onSnapshotChange(null);
    });

  }, [spotId]);

  useEffect(() => {
    if (!usgsSiteId) return;

    const dateStr = date.toISOString().split("T")[0];

    if (
      existingSnapshot &&
      existingSnapshot.monitoring_location_id === usgsSiteId &&
      existingSnapshot.date === dateStr &&
      hasWaterContent(existingSnapshot)
    ) {
      return;
    }

    const fetchWaterData = async () => {
      setLoading(true);
      try {
        const { data: cached } = await supabase
          .from("water_data_cache")
          .select("response_json")
          .eq("monitoring_location_id", usgsSiteId)
          .eq("date", dateStr)
          .maybeSingle();

        let result: any;

        if (cached?.response_json) {
          result = cached.response_json;
        } else {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const url = `https://${projectId}.supabase.co/functions/v1/water-data?monitoring_location_id=${encodeURIComponent(usgsSiteId)}&date=${dateStr}`;

          const resp = await fetch(url, {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          });

          if (!resp.ok) throw new Error("Failed to fetch water data");
          result = await resp.json();

          supabase
            .from("water_data_cache")
            .upsert(
              { monitoring_location_id: usgsSiteId, date: dateStr, response_json: result },
              { onConflict: "monitoring_location_id,date" }
            )
            .then(({ error }) => {
              if (error) console.warn("Cache write failed:", error);
            });
        }

        const { data: locData } = await supabase
          .from("usgs_monitoring_locations")
          .select("monitoring_location_name")
          .eq("site_id", usgsSiteId.replace("USGS-", ""))
          .maybeSingle();

        const snapshot: WaterFlowSnapshot = {
          monitoring_location_id: usgsSiteId,
          monitoring_location_name: locData?.monitoring_location_name || undefined,
          date: dateStr,
          fetched_at: new Date().toISOString(),
          daily_values: result.daily_values || [],
          historical: result.historical,
          statistics: result.statistics,
        };

        onSnapshotChange(snapshot);
      } catch (err) {
        console.error("Water data fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchWaterData();
  }, [usgsSiteId, date]);

  if (!usgsSiteId) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading water data…</span>
      </div>
    );
  }

  if (!existingSnapshot) return null;

  // Get mean values for compact display
  const meanValues = existingSnapshot.daily_values.filter((v) => v.statistic_id === "00003");
  const displayValues = meanValues.length > 0 ? meanValues : existingSnapshot.daily_values.slice(0, 2);

  const dischargeStats = existingSnapshot.statistics?.computed?.discharge;
  const gageStats = existingSnapshot.statistics?.computed?.gage_height;

  function getStats(paramCode: string): ComputedStats | undefined {
    if (paramCode === "00060") return dischargeStats;
    return gageStats;
  }

  // Build chart data from historical discharge
  const dischargeSeries = existingSnapshot.historical?.discharge?.series || [];
  const chartData = dischargeSeries
    .map((p) => ({
      fullDate: p.date || "",
      date: p.date ? format(new Date(p.date), "MMM d") : "",
      value: parseFloat(p.value),
    }))
    .filter((d) => !isNaN(d.value))
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  const gridLines = chartData.length > 0
    ? niceGridLines(Math.min(...chartData.map((d) => d.value)), Math.max(...chartData.map((d) => d.value)))
    : [];

  // Find max and min points for indicators
  const maxPoint = chartData.length > 0 ? chartData.reduce((a, b) => b.value > a.value ? b : a) : null;
  const minPoint = chartData.length > 0 ? chartData.reduce((a, b) => b.value < a.value ? b : a) : null;
  const hasCompactValues = displayValues.length > 0;
  const emptyMessage = existingSnapshot.daily_values.length === 0
    ? "No USGS daily values were returned for this site and date."
    : "No stream flow history is available for this site.";

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
          {hasCompactValues ? (
            displayValues.map((v, i) => {
              const val = parseFloat(v.value);
              const stats = getStats(v.parameter_code);
              return (
                <div key={i} className="flex items-center gap-1.5">
                  {getParamIcon(v.parameter_code)}
                  <span className="text-sm font-semibold text-foreground">
                    {v.value}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{v.unit}</span>
                  {stats?.p10 != null && stats?.p90 != null && !isNaN(val) && (
                    <RangeBar value={val} p10={stats.p10} p90={stats.p90} />
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <Droplets className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">No USGS flow data for this date</span>
            </div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <>
          {chartData.length > 2 && (
            <div className="mt-2 p-3 rounded-xl bg-card border border-border/50">
              <p className="text-[10px] text-muted-foreground mb-1">Stream flow (100 day)</p>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(val: number) => [`${val} cfs`, "Discharge"]}
                    labelFormatter={(lbl: string) => lbl}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5}
                    fill="url(#flowGrad)"
                  />
                  {gridLines.map((y) => (
                    <ReferenceLine
                      key={y}
                      y={y}
                      stroke="hsl(var(--muted-foreground))"
                      strokeOpacity={0.4}
                      strokeDasharray="2 3"
                      ifOverflow="extendDomain"
                      label={{ value: `${y}`, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    />
                  ))}
                  {maxPoint && (
                    <ReferenceDot
                      x={maxPoint.date}
                      y={maxPoint.value}
                      r={3}
                      fill="hsl(var(--destructive))"
                      stroke="hsl(var(--destructive))"
                      label={{ value: `▲ ${maxPoint.value}`, position: "top", fontSize: 9, fill: "hsl(var(--destructive))" }}
                    />
                  )}
                  {minPoint && (
                    <ReferenceDot
                      x={minPoint.date}
                      y={minPoint.value}
                      r={3}
                      fill="hsl(var(--accent))"
                      stroke="hsl(var(--accent))"
                      label={{ value: `▼ ${minPoint.value}`, position: "bottom", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    />
                  )}

                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {chartData.length <= 2 && (
            <div className="mt-2 p-3 rounded-xl bg-card border border-border/50">
              <p className="text-xs text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
          {existingSnapshot.monitoring_location_name && (
            <p className="mt-1 text-[10px] text-muted-foreground truncate px-1">
              {existingSnapshot.monitoring_location_name}
            </p>
          )}
        </>
      )}
    </div>
  );
});

WaterDataSection.displayName = "WaterDataSection";

export default WaterDataSection;
