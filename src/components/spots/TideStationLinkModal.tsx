import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Check, Anchor } from "lucide-react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/lib/googleMaps";
import { fetchNearbyTideStations, NearbyTideStation } from "@/lib/tide";
import { setSpotTidalStation } from "@/lib/spotData";

interface TideStationLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spot: {
    id: string;
    name: string | null;
    body_of_water: string;
    noaa_tide_station_id?: string | null;
    spot_points: { id: string; label: string; latitude: number; longitude: number }[];
  };
  onLinked: () => void;
}

const StationMap = ({
  apiKey, stations, selected, center, onSelect,
}: {
  apiKey: string;
  stations: NearbyTideStation[];
  selected: string | null;
  center: { lat: number; lng: number };
  onSelect: (id: string) => void;
}) => {
  const { isLoaded } = useGoogleMaps(apiKey);
  const mapRef = useRef<google.maps.Map | null>(null);

  if (!isLoaded) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={center}
      zoom={9}
      onLoad={(m) => { mapRef.current = m; }}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        mapTypeId: "roadmap",
      }}
    >
      <Marker
        position={center}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#F97316",
          fillOpacity: 1,
          strokeColor: "#000",
          strokeWeight: 2,
        }}
      />
      {stations.map((s) => (
        <Marker
          key={s.stationId}
          position={{ lat: s.stationLat, lng: s.stationLon }}
          onClick={() => onSelect(s.stationId)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: selected === s.stationId ? 9 : 6,
            fillColor: selected === s.stationId ? "#38A169" : "#3182CE",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          }}
        />
      ))}
    </GoogleMap>
  );
};

/** Full-screen picker for linking a NOAA tide station to a tidal spot. */
const TideStationLinkModal = ({ open, onOpenChange, spot, onLinked }: TideStationLinkModalProps) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stations, setStations] = useState<NearbyTideStation[]>([]);
  const [selected, setSelected] = useState<string | null>(spot.noaa_tide_station_id || null);

  const ref = spot.spot_points[0];

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  const load = useCallback(async () => {
    if (!ref) { setLoading(false); return; }
    setLoading(true);
    const list = await fetchNearbyTideStations(ref.latitude, ref.longitude, "tide_predictions", 15);
    setStations(list);
    setLoading(false);
  }, [ref]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleSave = async () => {
    const station = stations.find((s) => s.stationId === selected);
    if (!station) return;
    setSaving(true);
    const { error } = await setSpotTidalStation(spot.id, {
      stationId: station.stationId,
      stationName: station.stationName,
      stationLat: station.stationLat,
      stationLon: station.stationLon,
      distanceMiles: station.distanceMiles,
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to link tide station");
      return;
    }
    toast.success("Tide station linked");
    onLinked();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-0 left-0 top-0 max-w-none w-screen h-[100svh] max-h-[100svh] translate-x-0 translate-y-0 z-[60] p-0 border-0 rounded-none [&>button]:hidden overflow-hidden">
        <div className="relative w-full h-full min-h-0 flex flex-col overflow-hidden">
          <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border/50 safe-area-top">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="rounded-lg px-2" onClick={() => onOpenChange(false)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">Link tide station</p>
                <p className="text-xs text-muted-foreground truncate">{spot.name || spot.body_of_water}</p>
              </div>
            </div>
          </div>

          <div className="shrink-0 h-[40%] min-h-[140px] border-b border-border/50">
            {apiKey && ref ? (
              <StationMap
                apiKey={apiKey}
                stations={stations}
                selected={selected}
                center={{ lat: ref.latitude, lng: ref.longitude }}
                onSelect={setSelected}
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-sm text-muted-foreground">
                {ref ? "Map unavailable" : "Add a pin to this spot first"}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : stations.length === 0 ? (
              <p className="text-sm text-muted-foreground italic p-4 text-center">
                No NOAA tide stations found near this spot.
              </p>
            ) : (
              stations.map((s) => (
                <button
                  key={s.stationId}
                  type="button"
                  onClick={() => setSelected(s.stationId)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                    selected === s.stationId ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <Anchor className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{s.stationName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.stationId} · {s.distanceMiles.toFixed(1)} mi away
                    </p>
                  </div>
                  {selected === s.stationId && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-border/50 px-3 pt-3 safe-area-bottom-action">
            <Button
              variant="catch"
              className="w-full h-11 rounded-xl"
              disabled={!selected || saving}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Link station"}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TideStationLinkModal;
