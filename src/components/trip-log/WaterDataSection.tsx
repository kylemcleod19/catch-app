import { useState, useEffect } from "react";
import { Droplets, Loader2, Waves } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DailyValue {
  parameter_code: string;
  parameter_name?: string;
  statistic_id: string;
  value: string;
  unit: string;
  date: string;
  approval_status?: string;
}

export interface WaterFlowSnapshot {
  monitoring_location_id: string;
  monitoring_location_name?: string;
  date: string;
  fetched_at: string;
  daily_values: DailyValue[];
}

interface WaterDataSectionProps {
  spotId: string | null;
  date: Date;
  existingSnapshot: WaterFlowSnapshot | null;
  onSnapshotChange: (snapshot: WaterFlowSnapshot | null) => void;
}

const PARAM_LABELS: Record<string, string> = {
  "00060": "Discharge",
  "00065": "Gage Height",
  "62615": "Gage Height",
};

const STAT_LABELS: Record<string, string> = {
  "00001": "Max",
  "00002": "Min",
  "00003": "Mean",
};

const WaterDataSection = ({ spotId, date, existingSnapshot, onSnapshotChange }: WaterDataSectionProps) => {
  const [loading, setLoading] = useState(false);
  const [usgsSiteId, setUsgsSiteId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);

  // Look up spot's USGS site ID when spotId changes
  useEffect(() => {
    if (!spotId) {
      setUsgsSiteId(null);
      setLocationName(null);
      onSnapshotChange(null);
      return;
    }

    supabase
      .from("spots")
      .select("usgs_site_id")
      .eq("id", spotId)
      .single()
      .then(({ data }) => {
        const siteId = data?.usgs_site_id || null;
        setUsgsSiteId(siteId);
        if (!siteId) {
          onSnapshotChange(null);
        }
      });
  }, [spotId]);

  // Fetch water data when site ID or date changes
  useEffect(() => {
    if (!usgsSiteId) return;

    const dateStr = date.toISOString().split("T")[0];

    // If we already have a snapshot for this site+date, skip
    if (
      existingSnapshot &&
      existingSnapshot.monitoring_location_id === usgsSiteId &&
      existingSnapshot.date === dateStr
    ) {
      return;
    }

    const fetchWaterData = async () => {
      setLoading(true);
      try {
        // Get location name from USGS table
        const { data: locData } = await supabase
          .from("usgs_monitoring_locations")
          .select("monitoring_location_name")
          .eq("site_id", usgsSiteId.replace("USGS-", ""))
          .single();

        const locName = locData?.monitoring_location_name || null;
        setLocationName(locName);

        const { data, error } = await supabase.functions.invoke("water-data", {
          body: null,
          method: "GET",
        });

        // supabase.functions.invoke doesn't support query params well for GET,
        // so let's use fetch directly
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectId}.supabase.co/functions/v1/water-data?monitoring_location_id=${encodeURIComponent(usgsSiteId)}&date=${dateStr}`;
        
        const resp = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });

        if (!resp.ok) throw new Error("Failed to fetch water data");

        const result = await resp.json();

        const snapshot: WaterFlowSnapshot = {
          monitoring_location_id: usgsSiteId,
          monitoring_location_name: locName || undefined,
          date: dateStr,
          fetched_at: new Date().toISOString(),
          daily_values: result.daily_values || [],
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
        <span className="text-sm text-muted-foreground">Loading water conditions…</span>
      </div>
    );
  }

  if (!existingSnapshot || existingSnapshot.daily_values.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
        <Droplets className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">No water data available for this date</span>
      </div>
    );
  }

  // Group by parameter, show mean values primarily
  const meanValues = existingSnapshot.daily_values.filter((v) => v.statistic_id === "00003");
  const displayValues = meanValues.length > 0 ? meanValues : existingSnapshot.daily_values.slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Waves className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Water Conditions</span>
        <span className="text-xs text-muted-foreground">({existingSnapshot.date})</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {displayValues.map((v, i) => {
          const label = PARAM_LABELS[v.parameter_code] || v.parameter_name || v.parameter_code;
          const statLabel = STAT_LABELS[v.statistic_id] || "";

          return (
            <div
              key={i}
              className="flex flex-col p-3 rounded-xl bg-card border border-border/50"
            >
              <span className="text-xs text-muted-foreground">
                {label}{statLabel ? ` (${statLabel})` : ""}
              </span>
              <span className="text-lg font-semibold text-foreground">
                {v.value}
                <span className="text-xs font-normal text-muted-foreground ml-1">{v.unit}</span>
              </span>
            </div>
          );
        })}
      </div>
      {locationName && (
        <p className="text-xs text-muted-foreground truncate">
          Station: {locationName}
        </p>
      )}
    </div>
  );
};

export default WaterDataSection;
