import { useEffect, useState } from "react";
import { Loader2, ArrowUp, ArrowDown, Waves } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { fetchTideData, formatTideTime, TideResponse } from "@/lib/tide";

interface Props {
  lat: number;
  lon: number;
  spotId?: string;
}

/** Live tide conditions for a tidal spot: current state, today's curve, and upcoming highs/lows. */
const SpotTideConditions = ({ lat, lon, spotId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TideResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTideData({ lat, lon, mode: "current_day", days: 3, spotId }).then((res) => {
      if (cancelled) return;
      setData(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [lat, lon, spotId]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.tides || data.tides.events.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Tide predictions unavailable right now.</p>;
  }

  const { current, curve, events } = data.tides;
  const chartData = curve.map((p) => ({
    label: formatTideTime(p.t),
    hour: parseInt(p.t.slice(11, 13), 10) + parseInt(p.t.slice(14, 16), 10) / 60,
    height: p.height,
  }));

  const heights = chartData.map((d) => d.height);
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  // Tide heights are small (feet), so use 0.5 ft gridlines rather than the flow helper.
  const step = max - min > 4 ? 1 : 0.5;
  const lines: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) lines.push(Number(v.toFixed(1)));

  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;

  return (
    <div className="space-y-3">
      {/* Current state */}
      {current && (
        <div className="catch-card flex items-center gap-3 py-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {current.direction === "incoming" ? (
              <ArrowUp className="w-4 h-4 text-primary" />
            ) : current.direction === "outgoing" ? (
              <ArrowDown className="w-4 h-4 text-primary" />
            ) : (
              <Waves className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-card-foreground capitalize">
              {current.direction === "slack" ? "Slack tide" : `${current.direction} tide`}
              <span className="text-muted-foreground font-normal"> · {current.height.toFixed(2)} ft</span>
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {current.movementStrength} movement
              {current.nextEvent
                ? ` · next ${current.nextEvent.type} ${formatTideTime(current.nextEvent.time)}`
                : ""}
            </p>
          </div>
        </div>
      )}

      {/* Today's curve */}
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {lines.map((v) => (
              <ReferenceLine key={v} y={v} stroke="hsl(var(--border))" strokeDasharray="2 4" />
            ))}
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 24]}
              ticks={[0, 6, 12, 18, 24]}
              tickFormatter={(h: number) =>
                h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`
              }
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={36}
              tickFormatter={(v: number) => `${v}`}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(_, p: any) => p?.[0]?.payload?.label || ""}
              formatter={(v: number) => [`${v.toFixed(2)} ft`, "Height"]}
            />
            <ReferenceLine x={nowHour} stroke="hsl(var(--primary))" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="height"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#tideFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Today's highs & lows */}
      <div className="flex flex-wrap gap-1.5">
        {events.map((e) => (
          <span
            key={`${e.t}-${e.type}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs text-foreground"
          >
            {e.type === "high" ? (
              <ArrowUp className="w-3 h-3 text-primary" />
            ) : (
              <ArrowDown className="w-3 h-3 text-primary" />
            )}
            {formatTideTime(e.t)} · {e.height.toFixed(1)} ft
          </span>
        ))}
      </div>

      {/* Upcoming days */}
      {data.forecastDays && data.forecastDays.length > 1 && (
        <div className="space-y-1">
          {data.forecastDays.slice(1).map((d) => (
            <div key={d.date} className="flex items-center gap-2 text-xs">
              <span className="w-12 shrink-0 text-muted-foreground">
                {format(parseISO(d.date), "MMM d")}
              </span>
              <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-foreground">
                {d.events.map((e) => (
                  <span key={`${e.t}-${e.type}`} className="inline-flex items-center gap-0.5">
                    {e.type === "high" ? (
                      <ArrowUp className="w-3 h-3 text-primary" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-muted-foreground" />
                    )}
                    {formatTideTime(e.t)}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.tideSource && (
        <p className="text-[11px] text-muted-foreground">
          NOAA {data.tideSource.stationName} · {data.tideSource.distanceMiles.toFixed(1)} mi
        </p>
      )}
    </div>
  );
};

export default SpotTideConditions;
