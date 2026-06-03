import { useEffect, useState } from "react";
import { Loader2, Activity, Ruler } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

interface Props {
  usgsSiteId: string;
}

interface Series {
  date: string;
  value: number;
}

const SpotWaterConditions = ({ usgsSiteId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [discharge, setDischarge] = useState<Series[]>([]);
  const [gage, setGage] = useState<Series[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const dateStr = new Date().toISOString().split("T")[0];
        let result: any;

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
            usgsSiteId
          )}&date=${dateStr}`;
          const resp = await fetch(url, {
            headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          });
          if (!resp.ok) throw new Error("Failed to load water data");
          result = await resp.json();
          supabase
            .from("water_data_cache")
            .upsert(
              { monitoring_location_id: usgsSiteId, date: dateStr, response_json: result },
              { onConflict: "monitoring_location_id,date" }
            )
            .then(() => {});
        }

        if (cancelled) return;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const mapSeries = (arr: any[] = []): Series[] =>
          arr
            .map((p) => ({ date: p.date || "", value: parseFloat(p.value) }))
            .filter((d) => d.date && !isNaN(d.value) && new Date(d.date) >= cutoff)
            .sort((a, b) => a.date.localeCompare(b.date));

        setDischarge(mapSeries(result?.historical?.discharge?.series));
        setGage(mapSeries(result?.historical?.gage_height?.series));
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [usgsSiteId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading 30-day conditions…</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-xs text-muted-foreground p-2">{error}</div>;
  }

  const renderChart = (data: Series[], color: string, unit: string, label: string, gradId: string) => (
    <div className="p-3 rounded-xl bg-card border border-border/50">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-muted-foreground">{label} (30 day)</p>
        {data.length > 0 && (
          <p className="text-[10px] font-medium text-foreground">
            {data[data.length - 1].value} {unit}
          </p>
        )}
      </div>
      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={data.map((d) => ({ ...d, label: d.date.slice(5, 10) }))}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
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
              formatter={(val: number) => [`${val} ${unit}`, label]}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#${gradId})`} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-muted-foreground">No data available</p>
      )}
    </div>
  );

  const hasAny = discharge.length > 0 || gage.length > 0;
  if (!hasAny) {
    return (
      <div className="text-xs text-muted-foreground p-3 rounded-xl bg-muted/30">
        No water data available for this station in the last 30 days.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {discharge.length > 0 &&
        renderChart(discharge, "hsl(var(--primary))", "cfs", "Stream flow", `flow-${usgsSiteId}`)}
      {gage.length > 0 &&
        renderChart(gage, "hsl(var(--accent))", "ft", "Gage height", `gage-${usgsSiteId}`)}
    </div>
  );
};

export default SpotWaterConditions;
