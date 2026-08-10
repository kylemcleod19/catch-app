import { forwardRef, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Waves } from "lucide-react";
import { Area, AreaChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { SPOT_TYPE_SELECT, flattenSpot } from "@/lib/spotData";
import { TideResponse, fetchTideData, formatTideTime } from "@/lib/tide";

export type TideSnapshot = TideResponse & { spot_id?: string };

interface Props {
  spotId: string | null;
  date: Date;
  startTime: string;
  endTime: string;
  existingSnapshot: TideSnapshot | null;
  onSnapshotChange: (snapshot: TideSnapshot | null) => void;
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toIso(date: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

function hourOf(t: string) {
  return parseInt(t.slice(11, 13), 10) + parseInt(t.slice(14, 16), 10) / 60;
}

/** Tide conditions for a trip at a tidal spot. Mirrors WaterDataSection's collapsible layout. */
const TideDataSection = forwardRef<HTMLDivElement, Props>(
  ({ spotId, date, startTime, endTime, existingSnapshot, onSnapshotChange }, ref) => {
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [isTidal, setIsTidal] = useState(false);

    // Resolve whether the spot is tidal and where it sits.
    useEffect(() => {
      let cancelled = false;
      if (!spotId) {
        setIsTidal(false);
        setCoords(null);
        return;
      }
      (async () => {
        const { data } = await supabase
          .from("spots")
          .select(`id, site_type, ${SPOT_TYPE_SELECT}`)
          .eq("id", spotId)
          .maybeSingle();
        if (cancelled || !data) return;
        const spot = flattenSpot(data as any);
        if (!spot.is_tidal) {
          setIsTidal(false);
          setCoords(null);
          return;
        }
        setIsTidal(true);

        const { data: points } = await supabase
          .from("spot_points")
          .select("latitude, longitude")
          .eq("spot_id", spotId)
          .limit(1);
        const p = points?.[0];
        if (cancelled) return;
        if (p) setCoords({ lat: p.latitude, lon: p.longitude });
        else if (spot.noaa_station_lat != null && spot.noaa_station_lon != null)
          setCoords({ lat: spot.noaa_station_lat, lon: spot.noaa_station_lon });
        else setCoords(null);
      })();
      return () => {
        cancelled = true;
      };
    }, [spotId]);

    const dateStr = localDateStr(date);

    useEffect(() => {
      if (!isTidal || !coords || !spotId) return;

      const hasSnapshot =
        existingSnapshot &&
        existingSnapshot.spot_id === spotId &&
        existingSnapshot.date === dateStr &&
        (existingSnapshot.tides?.curve?.length || 0) > 0;
      if (hasSnapshot) return;

      let cancelled = false;
      setLoading(true);
      fetchTideData({
        lat: coords.lat,
        lon: coords.lon,
        spotId,
        mode: "historical_trip",
        date: dateStr,
        start: toIso(date, startTime),
        end: toIso(date, endTime),
      })
        .then((res) => {
          if (cancelled) return;
          if (res) onSnapshotChange({ ...res, spot_id: spotId });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [isTidal, coords, spotId, dateStr, startTime, endTime]);

    if (!isTidal) return null;

    if (loading) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading tide data…</span>
        </div>
      );
    }

    const snap = existingSnapshot;
    const tides = snap?.tides;

    if (!snap || !tides || tides.curve.length === 0) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border/50">
          <Waves className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">No tide data for this date</span>
        </div>
      );
    }

    const win = tides.tripWindow;
    const chartData = tides.curve.map((p) => ({
      hour: hourOf(p.t),
      label: formatTideTime(p.t),
      height: p.height,
    }));
    const heights = chartData.map((d) => d.height);
    const min = Math.min(...heights);
    const max = Math.max(...heights);
    const step = max - min > 4 ? 1 : 0.5;
    const lines: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) lines.push(Number(v.toFixed(1)));

    const startHour = Number(startTime.split(":")[0]) + Number(startTime.split(":")[1]) / 60;
    const endHour = Number(endTime.split(":")[0]) + Number(endTime.split(":")[1]) / 60;

    return (
      <div ref={ref}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
            {win ? (
              <>
                <div className="flex items-center gap-1.5">
                  {win.dominantDirection === "incoming" ? (
                    <ArrowUp className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-accent" />
                  )}
                  <span className="text-sm font-semibold text-foreground capitalize">{win.dominantDirection}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {win.startHeight.toFixed(1)} → {win.endHeight.toFixed(1)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">ft</span>
                </div>
                {win.crossedEvents.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    crossed {win.crossedEvents.map((e) => e.type).join(", ")}
                  </span>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <Waves className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-sm text-foreground truncate">
                  {tides.events.length} tide events
                </span>
              </div>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded && (
          <>
            <div className="mt-2 p-3 rounded-xl bg-card border border-border/50">
              <p className="text-[10px] text-muted-foreground mb-1">Tide height (ft)</p>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tripTideFill" x1="0" y1="0" x2="0" y2="1">
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
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    labelFormatter={(_, p: any) => p?.[0]?.payload?.label || ""}
                    formatter={(v: number) => [`${v.toFixed(2)} ft`, "Height"]}
                  />
                  <ReferenceArea x1={startHour} x2={endHour} fill="hsl(var(--primary))" fillOpacity={0.1} />
                  <Area
                    type="monotone"
                    dataKey="height"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#tripTideFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {tides.events.map((e) => (
                  <span
                    key={`${e.t}-${e.type}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs text-foreground"
                  >
                    {e.type === "high" ? (
                      <ArrowUp className="w-3 h-3 text-primary" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-accent" />
                    )}
                    {formatTideTime(e.t)} · {e.height.toFixed(1)} ft
                  </span>
                ))}
              </div>

              {win && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-[11px] text-muted-foreground">
                  <span>Net change: {win.netChangeFt > 0 ? "+" : ""}{win.netChangeFt.toFixed(2)} ft</span>
                  <span>Max rate: {win.maxRateFtPerHour.toFixed(2)} ft/hr</span>
                  <span>Incoming: {Math.round(win.percentIncoming)}%</span>
                  <span>Outgoing: {Math.round(win.percentOutgoing)}%</span>
                </div>
              )}
            </div>

            {snap.tideSource && (
              <p className="mt-1 text-[10px] text-muted-foreground truncate px-1">
                NOAA {snap.tideSource.stationName} · {snap.tideSource.distanceMiles.toFixed(1)} mi
              </p>
            )}
          </>
        )}
      </div>
    );
  },
);

TideDataSection.displayName = "TideDataSection";

export default TideDataSection;
