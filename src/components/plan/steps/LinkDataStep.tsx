import { useEffect, useState } from "react";
import { Activity, Waves, CloudSun, Check, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import PlanMap, { type PlanPin } from "../PlanMap";
import StationLinkModal from "@/components/spots/StationLinkModal";
import TideStationLinkModal from "@/components/spots/TideStationLinkModal";
import { findBestStation, linkStation, milesBetween, type StationMatch } from "@/lib/planSuggest";
import { fetchUserSpots, type SpotLite } from "@/lib/planTrip";

interface Props {
  spot: SpotLite;
  onSpotUpdated: (s: SpotLite) => void;
  onNext: () => void;
}

/** Links weather + the right water station to the spot, automatically, with Change/Skip. */
const LinkDataStep = ({ spot, onSpotUpdated, onNext }: Props) => {
  const tidal = spot.is_tidal || spot.site_type === "Tidal";
  const linkedId = tidal ? spot.noaa_tide_station_id : spot.usgs_site_id;
  const [searching, setSearching] = useState(!linkedId);
  const [match, setMatch] = useState<StationMatch | null>(null);
  const [modal, setModal] = useState(false);
  const point = spot.spot_points?.[0];

  const refresh = async () => {
    try {
      const fresh = (await fetchUserSpots()).find((s) => s.id === spot.id);
      if (fresh) onSpotUpdated(fresh);
    } catch { /* keep current */ }
  };

  useEffect(() => {
    if (linkedId) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await findBestStation(spot);
        if (cancelled) return;
        setMatch(m);
        if (m) {
          const { error } = await linkStation(spot, m);
          if (error) throw error;
          await refresh();
        }
      } catch {
        if (!cancelled) toast.error("Couldn't link a station automatically — you can pick one");
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id]);

  const stationPos =
    match ? { lat: match.lat, lng: match.lng }
      : tidal && spot.noaa_station_lat != null && spot.noaa_station_lon != null ? { lat: spot.noaa_station_lat, lng: spot.noaa_station_lon }
      : null;

  const pins: PlanPin[] = [];
  if (point) pins.push({ id: "spot", lat: point.latitude, lng: point.longitude, kind: "spot" });
  if (stationPos) pins.push({ id: "station", ...stationPos, kind: "station" });

  const stationLabel = tidal
    ? spot.noaa_tide_station_id ? `${spot.noaa_station_name || match?.name || "NOAA station"}` : null
    : spot.usgs_site_id ? match?.name || `USGS ${spot.usgs_site_id}` : null;
  const miles = match?.miles ?? (point && stationPos ? milesBetween({ lat: point.latitude, lng: point.longitude }, stationPos) : null);

  return (
    <div className="space-y-4 pt-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Live data for {spot.name || spot.body_of_water}</h2>
        <p className="text-sm text-muted-foreground mt-1">We link your spot to nearby stations so the plan uses real conditions.</p>
      </div>

      {point && <PlanMap center={{ lat: point.latitude, lng: point.longitude }} pins={pins} height="h-52" zoom={11} />}

      <div className="p-4 rounded-xl bg-surface border border-border flex items-center gap-3">
        <CloudSun className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Weather</p>
          <p className="text-xs text-muted-foreground">Linked by the spot's location</p>
        </div>
        <Check className="w-4 h-4 text-primary" />
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
        <div className="flex items-center gap-3">
          {tidal ? <Waves className="w-5 h-5 text-primary shrink-0" /> : <Activity className="w-5 h-5 text-primary shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{tidal ? "Tide station" : "River / lake gage"}</p>
            {searching ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Finding the nearest station…</p>
            ) : stationLabel ? (
              <p className="text-xs text-muted-foreground truncate">
                {stationLabel}{miles != null ? ` · ${miles.toFixed(1)} mi away` : ""}
                {match?.params?.length ? ` · ${match.params.join(", ")}` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No station found nearby</p>
            )}
          </div>
          {stationLabel && !searching && <Check className="w-4 h-4 text-primary" />}
        </div>
        <button
          onClick={() => setModal(true)}
          disabled={searching || !point}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-foreground disabled:opacity-40"
        >
          {stationLabel ? "Change station" : "Pick a station"}
        </button>
      </div>

      <button
        onClick={onNext}
        disabled={searching}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
      >
        {stationLabel ? "Next" : "Skip for now"} <ChevronRight className="w-4 h-4" />
      </button>

      {tidal ? (
        <TideStationLinkModal open={modal} onOpenChange={setModal} spot={spot} onLinked={() => { setMatch(null); refresh(); }} />
      ) : (
        <StationLinkModal open={modal} onOpenChange={setModal} spot={spot} onLinked={() => { setMatch(null); refresh(); }} />
      )}
    </div>
  );
};

export default LinkDataStep;
