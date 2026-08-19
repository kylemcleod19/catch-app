import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { MapPin, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/lib/googleMaps";
import type { CandidateSpot } from "@/lib/planTrip";

interface Props {
  spots: CandidateSpot[];
  onPick: (spot: CandidateSpot) => void;
  onNoneOfThese: () => void;
}

const CandidateSpotsMap = ({ spots, onPick, onNoneOfThese }: Props) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const { isLoaded } = useGoogleMaps(apiKey);

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  const pins = useMemo(
    () =>
      spots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => typeof s.latitude === "number" && typeof s.longitude === "number"),
    [spots],
  );

  const fitAll = (map: google.maps.Map) => {
    mapRef.current = map;
    if (!pins.length) return;
    const bounds = new google.maps.LatLngBounds();
    pins.forEach(({ s }) => bounds.extend({ lat: s.latitude!, lng: s.longitude! }));
    if (pins.length === 1) map.setZoom(11);
    map.fitBounds(bounds, 48);
  };

  useEffect(() => {
    if (selected == null || !mapRef.current) return;
    const s = spots[selected];
    if (typeof s?.latitude === "number" && typeof s?.longitude === "number") {
      mapRef.current.panTo({ lat: s.latitude, lng: s.longitude });
    }
  }, [selected, spots]);

  return (
    <div className="space-y-3 pt-1">
      {pins.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-border h-56 bg-surface">
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={{ lat: pins[0].s.latitude!, lng: pins[0].s.longitude! }}
              zoom={9}
              onLoad={fitAll}
              options={{
                gestureHandling: "greedy",
                disableDefaultUI: true,
                zoomControl: true,
                mapTypeId: "hybrid",
              }}
            >
              {pins.map(({ s, i }) => (
                <Marker
                  key={i}
                  position={{ lat: s.latitude!, lng: s.longitude! }}
                  label={{ text: String(i + 1), color: "#fff", fontWeight: "700", fontSize: "12px" }}
                  onClick={() => setSelected(i)}
                  zIndex={selected === i ? 10 : 1}
                />
              ))}
            </GoogleMap>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {spots.map((s, i) => {
          const isSel = selected === i;
          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                isSel ? "bg-primary/5 border-primary" : "bg-surface border-border active:bg-surface/80"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                    isSel ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  {i + 1}
                </span>
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <p className="font-semibold text-foreground flex-1">{s.name}</p>
                {isSel && <Check className="w-4 h-4 text-primary shrink-0" />}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{s.why}</p>
              <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground mt-1.5">
                {s.species?.length > 0 && <span>{s.species.join(" · ")}</span>}
                {s.access && <span>· {s.access}</span>}
                {s.water_type && <span>· {s.water_type}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-foreground font-medium pt-1">Do any of these sound like a good trip?</p>

      <button
        disabled={selected == null}
        onClick={() => selected != null && onPick(spots[selected])}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
      >
        {selected == null ? "Pick one to continue" : `Plan a trip to ${spots[selected].name}`}
      </button>

      <button
        onClick={onNoneOfThese}
        className="w-full py-2.5 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground"
      >
        None of these — tell the AI why
      </button>
    </div>
  );
};

export default CandidateSpotsMap;
