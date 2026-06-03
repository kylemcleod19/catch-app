import { useEffect, useState } from "react";
import { Loader2, Droplets, Wind } from "lucide-react";
import { format } from "date-fns";

interface Props {
  lat: number;
  lon: number;
}

interface ForecastDay {
  date: string;
  temp_high_f: number | null;
  temp_low_f: number | null;
  conditions: string | null;
  short_forecast: string | null;
  precip_probability_pct: number | null;
  wind_speed_kmh: number | null;
}

function getWeatherIcon(conditions?: string | null): string {
  if (!conditions) return "☀️";
  const c = conditions.toLowerCase();
  if (c.includes("thunder") || c.includes("storm")) return "⛈️";
  if (c.includes("rain") || c.includes("shower")) return "🌧️";
  if (c.includes("snow")) return "🌨️";
  if (c.includes("cloud") || c.includes("overcast")) return "☁️";
  if (c.includes("partly") || c.includes("mostly sunny")) return "⛅";
  if (c.includes("fog") || c.includes("mist")) return "🌫️";
  return "☀️";
}

const kmhToMph = (k: number) => Math.round(k * 0.621371);

const SpotWeatherForecast = ({ lat, lon }: Props) => {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<ForecastDay[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectId}.supabase.co/functions/v1/weather?mode=forecast&lat=${lat}&lon=${lon}`;
        const resp = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        if (!resp.ok) throw new Error("Forecast unavailable");
        const json = await resp.json();
        if (!cancelled) setDays(json.forecast || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Forecast unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading 7-day forecast…</span>
      </div>
    );
  }

  if (error || days.length === 0) {
    return (
      <div className="text-xs text-muted-foreground p-3 rounded-xl bg-muted/30">
        {error || "No forecast available for this location."}
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-card border border-border/50">
      <p className="text-[10px] text-muted-foreground mb-2">7-day forecast</p>
      <div className="flex justify-between gap-1">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(d.date + "T12:00:00"), "EEE")}
            </span>
            <span className="text-base leading-none">{getWeatherIcon(d.conditions)}</span>
            <div className="flex items-baseline gap-0.5">
              <span className="text-xs font-semibold text-foreground">
                {d.temp_high_f != null ? `${d.temp_high_f}°` : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {d.temp_low_f != null ? `${d.temp_low_f}°` : ""}
              </span>
            </div>
            {d.precip_probability_pct != null && d.precip_probability_pct > 0 ? (
              <span className="flex items-center gap-0.5 text-[10px] text-accent">
                <Droplets className="w-2.5 h-2.5" />
                {d.precip_probability_pct}%
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground/0">·</span>
            )}
            {d.wind_speed_kmh != null && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Wind className="w-2.5 h-2.5" />
                {kmhToMph(d.wind_speed_kmh)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpotWeatherForecast;
