import { useEffect, useState } from "react";
import { Activity, Droplet, Loader2, Waves, CloudSun } from "lucide-react";
import SpotWaterConditions from "@/components/spots/SpotWaterConditions";
import SpotTideConditions from "@/components/spots/SpotTideConditions";
import SpotWeatherForecast from "@/components/spots/SpotWeatherForecast";
import { fetchFlowSeries, summarizeClarity, type ClaritySummary } from "@/lib/waterClarity";
import type { SpotLite } from "@/lib/planTrip";
import { hasForecast, FORECAST_DAYS } from "@/lib/planSuggest";

interface Props {
  spot: SpotLite;
  date?: string;
}

const TONE_CLASS: Record<ClaritySummary["tone"], string> = {
  clear: "text-primary",
  stained: "text-accent",
  muddy: "text-destructive",
  low: "text-primary",
  unknown: "text-muted-foreground",
};

const FlowAndClarity = ({ usgsSiteId }: { usgsSiteId: string }) => {
  const [loading, setLoading] = useState(true);
  const [clarity, setClarity] = useState<ClaritySummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFlowSeries(usgsSiteId)
      .then((s) => { if (!cancelled) setClarity(summarizeClarity(s.discharge)); })
      .catch(() => { if (!cancelled) setClarity(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [usgsSiteId]);

  return (
    <div className="space-y-2">
      <div className="p-3 rounded-xl bg-card border border-border/50 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Reading river flow…
          </div>
        ) : !clarity ? (
          <p className="text-xs text-muted-foreground">Flow data unavailable for this station.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-card-foreground">
                  {clarity.latest != null ? `${clarity.latest} cfs` : "Flow unavailable"}
                  {clarity.median != null && (
                    <span className="text-muted-foreground font-normal"> · 30-day median {Math.round(clarity.median)} cfs</span>
                  )}
                </p>
                <p className={`text-xs font-medium ${TONE_CLASS[clarity.tone]} flex items-center gap-1`}>
                  <Droplet className="w-3 h-3" />
                  Water clarity: {clarity.label}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{clarity.detail}</p>
          </>
        )}
      </div>
      <SpotWaterConditions usgsSiteId={usgsSiteId} />
    </div>
  );
};

/** Conditions block shown with a generated day plan: flow + clarity or tides, plus the weather outlook. */
const PlanConditions = ({ spot, date }: Props) => {
  const forecast = !date || hasForecast(date);
  const point = spot.spot_points?.[0];
  const isTidal = spot.is_tidal || spot.site_type === "Tidal";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        {isTidal ? <Waves className="w-4 h-4 text-primary" /> : <Activity className="w-4 h-4 text-primary" />}
        <p className="text-sm font-semibold text-foreground">
          {isTidal ? "Tide & weather" : "Water & weather"}
        </p>
      </div>

      {!forecast && (
        <p className="text-xs text-muted-foreground p-3 rounded-xl bg-muted/30">
          Your date is more than {FORECAST_DAYS} days out, so there's no weather forecast yet.{" "}
          {isTidal ? "Tide predictions are shown below." : "Showing current river conditions and the last 30 days."}
        </p>
      )}

      {isTidal ? (
        point ? (
          <SpotTideConditions lat={point.latitude} lon={point.longitude} spotId={spot.id} />
        ) : (
          <p className="text-xs text-muted-foreground">Add a pin to this spot to pull tide predictions.</p>
        )
      ) : spot.usgs_site_id ? (
        <FlowAndClarity usgsSiteId={spot.usgs_site_id} />
      ) : (
        <p className="text-xs text-muted-foreground p-3 rounded-xl bg-muted/30">
          No monitoring station linked — go back and pick one to see river flow and clarity.
        </p>
      )}

      {!forecast ? null : point ? (
        <SpotWeatherForecast lat={point.latitude} lon={point.longitude} />
      ) : (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CloudSun className="w-3.5 h-3.5" /> Weather needs a pin on this spot.
        </p>
      )}
    </div>
  );
};

export default PlanConditions;
