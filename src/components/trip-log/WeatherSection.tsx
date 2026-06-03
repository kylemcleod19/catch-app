import { forwardRef, useEffect, useState } from "react";
import { Cloud, Droplets, Loader2, Thermometer, Wind, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";



export interface WeatherSnapshot {
  lat: number;
  lon: number;
  date: string;
  fetched_at: string;
  data_gaps?: string[];
  location?: { city?: string; state?: string };
  given_day?: {
    data_gaps?: string[];
    summary?: {
      temp_high_c?: number;
      temp_low_c?: number;
      temp_avg_c?: number;
      precip_mm?: number;
      wind_speed_kmh?: number;
      wind_direction_deg?: number;
      conditions?: string;
      short_forecast?: string;
      pressure_hpa_avg?: number;
      pressure_hpa_min?: number;
      pressure_hpa_max?: number;
      pressure_trend_24h_hpa?: number;
      temp_change_24h_c?: number;
      narrative?: string;
      front_flag?: "cold_front" | "warm_front" | "stable" | "unsettled";
    };
    hourly?: Array<{
      time: string;
      temp_c: number;
      precip_probability_pct?: number;
      wind_speed_kmh?: number;
      conditions?: string;
    }>;
    pressure_series?: Array<{ date: string; value: number }>;
  };
}

interface WeatherSectionProps {
  spotId: string | null;
  tripId: string;
  date: Date;
  existingSnapshot: WeatherSnapshot | null;
  onSnapshotChange: (snapshot: WeatherSnapshot | null) => void;
}

function cToF(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371);
}

function mmToIn(mm: number): number {
  return Math.round(mm / 25.4 * 100) / 100;
}

function formatHour(timeStr: string): string {
  try {
    const d = new Date(timeStr);
    const h = d.getHours();
    if (h === 0) return "12a";
    if (h === 12) return "12p";
    return h > 12 ? `${h - 12}p` : `${h}a`;
  } catch {
    return "";
  }
}

function getWeatherIcon(conditions?: string): string {
  if (!conditions) return "☀️";
  const c = conditions.toLowerCase();
  if (c.includes("rain") || c.includes("shower")) return "🌧️";
  if (c.includes("thunder") || c.includes("storm")) return "⛈️";
  if (c.includes("snow")) return "🌨️";
  if (c.includes("cloud") || c.includes("overcast")) return "☁️";
  if (c.includes("partly") || c.includes("mostly sunny")) return "⛅";
  if (c.includes("fog") || c.includes("mist")) return "🌫️";
  return "☀️";
}

function hasWeatherContent(snapshot: WeatherSnapshot | null): boolean {
  if (!snapshot) return false;

  const summary = snapshot.given_day?.summary;
  const hasSummaryValues = Boolean(
    summary && (
      summary.temp_high_c != null ||
      summary.temp_low_c != null ||
      summary.temp_avg_c != null ||
      summary.precip_mm != null ||
      summary.wind_speed_kmh != null ||
      summary.conditions ||
      summary.short_forecast
    )
  );

  const hasPressure = summary?.pressure_hpa_avg != null || Boolean(summary?.narrative);
  return (hasSummaryValues || (snapshot.given_day?.hourly?.length || 0) > 0) && hasPressure;
}

function hasPressureInResponse(json: any): boolean {
  return json?.given_day?.summary?.pressure_hpa_avg != null || Boolean(json?.given_day?.summary?.narrative);
}

const WeatherSection = forwardRef<HTMLDivElement, WeatherSectionProps>(({ spotId, tripId, date, existingSnapshot, onSnapshotChange }, ref) => {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!spotId) {
      onSnapshotChange(null);
      return;
    }

    const dateStr = date.toISOString().split("T")[0];

    if (existingSnapshot && existingSnapshot.date === dateStr && hasWeatherContent(existingSnapshot)) {
      return;
    }

    const fetchWeather = async () => {
      setLoading(true);
      try {
        const { data: points } = await supabase
          .from("spot_points")
          .select("latitude, longitude")
          .eq("spot_id", spotId)
          .limit(1);

        if (!points?.length) {
          setLoading(false);
          return;
        }

        const { latitude: lat, longitude: lon } = points[0];

        const { data: cached } = await supabase
          .from("weather_data_cache")
          .select("response_json")
          .eq("lat", lat)
          .eq("lon", lon)
          .eq("date", dateStr)
          .maybeSingle();

        let result: any;

        if (cached?.response_json && hasPressureInResponse(cached.response_json)) {
          result = cached.response_json;
        } else {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const url = `https://${projectId}.supabase.co/functions/v1/weather?lat=${lat}&lon=${lon}&date=${dateStr}`;

          const resp = await fetch(url, {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          });

          if (!resp.ok) throw new Error("Failed to fetch weather data");
          result = await resp.json();

          supabase
            .from("weather_data_cache")
            .upsert(
              { lat, lon, date: dateStr, spot_id: spotId, trip_id: tripId, response_json: result } as any,
              { onConflict: "lat,lon,date" }
            )
            .then(({ error }) => {
              if (error) console.warn("Weather cache write failed:", error);
            });
        }

        const snapshot: WeatherSnapshot = {
          lat,
          lon,
          date: dateStr,
          fetched_at: new Date().toISOString(),
          location: result.location,
          given_day: result.given_day,
        };

        onSnapshotChange(snapshot);

        supabase
          .from("fishing_trips")
          .update({ weather_snapshot: snapshot as any })
          .eq("id", tripId)
          .then(({ error }) => {
            if (error) console.warn("Trip weather snapshot save failed:", error);
          });
      } catch (err) {
        console.error("Weather fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [spotId, date]);

  if (!spotId) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading weather…</span>
      </div>
    );
  }

  if (!existingSnapshot) return null;

  const s = existingSnapshot.given_day?.summary || {};
  const hourly = existingSnapshot.given_day?.hourly || [];
  const hasCompactValues =
    s.temp_high_c != null ||
    s.temp_low_c != null ||
    s.wind_speed_kmh != null ||
    (s.precip_mm != null && s.precip_mm > 0) ||
    s.pressure_hpa_avg != null ||
    Boolean(s.conditions);
  const pressureSeries = existingSnapshot.given_day?.pressure_series || [];
  const emptyMessage = existingSnapshot.given_day?.data_gaps?.includes(existingSnapshot.date)
    ? "No historical weather was returned for this date."
    : "Weather details aren't available for this date.";

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {hasCompactValues ? (
            <>
              {s.temp_high_c != null && s.temp_low_c != null && (
                <div className="flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-sm font-semibold text-foreground">
                    {cToF(s.temp_high_c)}°/{cToF(s.temp_low_c)}°
                  </span>
                </div>
              )}
              {s.wind_speed_kmh != null && (
                <div className="flex items-center gap-1">
                  <Wind className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm text-foreground">{kmhToMph(s.wind_speed_kmh)} mph</span>
                </div>
              )}
              {s.precip_mm != null && s.precip_mm > 0 && (
                <div className="flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-accent" />
                  <span className="text-sm text-foreground">{mmToIn(s.precip_mm)} in</span>
                </div>
              )}
              {s.conditions && (
                <span className="text-xs text-muted-foreground truncate">{s.conditions}</span>
              )}

            </>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <Cloud className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">No weather data for this date</span>
            </div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <>
          {hourly.length > 0 && (() => {
            // Sample down to 6 evenly-spaced points so it fits horizontally
            const step = Math.max(1, Math.ceil(hourly.length / 6));
            const sampled = hourly.filter((_, i) => i % step === 0).slice(0, 6);
            return (
              <div className="mt-2 p-3 rounded-xl bg-card border border-border/50">
                <div className="flex justify-between gap-1">
                  {sampled.map((h, i) => (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                      <span className="text-[10px] text-muted-foreground">{formatHour(h.time)}</span>
                      <span className="text-base">{getWeatherIcon(h.conditions)}</span>
                      <span className="text-xs font-semibold text-foreground">{cToF(h.temp_c)}°</span>
                      {h.precip_probability_pct != null && h.precip_probability_pct > 0 && (
                        <span className="text-[10px] text-accent">{h.precip_probability_pct}%</span>
                      )}
                      {h.wind_speed_kmh != null && (
                        <span className="text-[10px] text-muted-foreground">{kmhToMph(h.wind_speed_kmh)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {hourly.length === 0 && s.short_forecast && (
            <div className="mt-2 p-3 rounded-xl bg-card border border-border/50">
              <p className="text-xs text-muted-foreground">{s.short_forecast}</p>
            </div>
          )}
          {hourly.length === 0 && !s.short_forecast && (
            <div className="mt-2 p-3 rounded-xl bg-card border border-border/50">
              <p className="text-xs text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
});


WeatherSection.displayName = "WeatherSection";

export default WeatherSection;
