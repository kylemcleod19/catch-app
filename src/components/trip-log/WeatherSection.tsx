import { useState, useEffect } from "react";
import { Cloud, Loader2, Sun, Thermometer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface WeatherSnapshot {
  lat: number;
  lon: number;
  date: string;
  fetched_at: string;
  location?: { city?: string; state?: string };
  given_day?: {
    summary?: {
      temp_high_c?: number;
      temp_low_c?: number;
      temp_avg_c?: number;
      precip_mm?: number;
      wind_speed_kmh?: number;
      wind_direction_deg?: number;
      conditions?: string;
      short_forecast?: string;
    };
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

const WeatherSection = ({ spotId, tripId, date, existingSnapshot, onSnapshotChange }: WeatherSectionProps) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!spotId) {
      onSnapshotChange(null);
      return;
    }

    const dateStr = date.toISOString().split("T")[0];

    // If we already have a snapshot for this date, skip
    if (existingSnapshot && existingSnapshot.date === dateStr) {
      return;
    }

    const fetchWeather = async () => {
      setLoading(true);
      try {
        // Get spot's home base point coordinates
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

        // Check weather cache first
        const { data: cached } = await supabase
          .from("weather_data_cache")
          .select("response_json")
          .eq("lat", lat)
          .eq("lon", lon)
          .eq("date", dateStr)
          .maybeSingle();

        let result: any;

        if (cached?.response_json) {
          result = cached.response_json;
        } else {
          // Fetch from edge function
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const url = `https://${projectId}.supabase.co/functions/v1/weather?lat=${lat}&lon=${lon}&date=${dateStr}`;

          const resp = await fetch(url, {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          });

          if (!resp.ok) throw new Error("Failed to fetch weather data");
          result = await resp.json();

          // Cache (fire-and-forget) with spot_id and trip_id
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

        // Also store snapshot on the trip itself
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

  if (!existingSnapshot?.given_day?.summary) return null;

  const s = existingSnapshot.given_day.summary;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sun className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Weather</span>
        <span className="text-xs text-muted-foreground">({existingSnapshot.date})</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {s.temp_high_c != null && s.temp_low_c != null && (
          <div className="flex flex-col p-3 rounded-xl bg-card border border-border/50">
            <span className="text-xs text-muted-foreground">Temp</span>
            <span className="text-sm font-semibold text-foreground">
              {cToF(s.temp_high_c)}° / {cToF(s.temp_low_c)}°
              <span className="text-xs font-normal text-muted-foreground ml-1">F</span>
            </span>
          </div>
        )}
        {s.wind_speed_kmh != null && (
          <div className="flex flex-col p-3 rounded-xl bg-card border border-border/50">
            <span className="text-xs text-muted-foreground">Wind</span>
            <span className="text-sm font-semibold text-foreground">
              {Math.round(s.wind_speed_kmh * 0.621371)}
              <span className="text-xs font-normal text-muted-foreground ml-1">mph</span>
            </span>
          </div>
        )}
        {s.precip_mm != null && (
          <div className="flex flex-col p-3 rounded-xl bg-card border border-border/50">
            <span className="text-xs text-muted-foreground">Precip</span>
            <span className="text-sm font-semibold text-foreground">
              {Math.round(s.precip_mm / 25.4 * 100) / 100}
              <span className="text-xs font-normal text-muted-foreground ml-1">in</span>
            </span>
          </div>
        )}
      </div>
      {s.conditions && (
        <p className="text-xs text-muted-foreground">{s.conditions}</p>
      )}
    </div>
  );
};

export default WeatherSection;
