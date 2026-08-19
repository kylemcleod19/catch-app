import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { MapPin, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/lib/googleMaps";
import type { CandidateSpot } from "@/lib/planTrip";

interface Props {
  spots: CandidateSpot[];
  regionHint?: string | null;
  onPick: (spot: CandidateSpot) => void;
  onNoneOfThese: () => void;
}

const CandidateSpotsMap = ({ spots, regionHint, onPick, onNoneOfThese }: Props) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [resolved, setResolved] = useState<Record<number, { lat: number; lng: number }>>({});
  const mapRef = useRef<google.maps.Map | null>(null);
  const { isLoaded } = useGoogleMaps(apiKey);

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  // The model's coordinates are rough guesses and are often wrong. Geocode the
  // place name so pins land on the real access point.
  useEffect(() => {
    if (!isLoaded || !spots.length) return;
    let cancelled = false;
    const geocoder = new google.maps.Geocoder();
    (async () => {
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        const query = [s.search_query || s.name, regionHint].filter(Boolean).join(", ");
        try {
          const { results } = await geocoder.geocode({ address: query });
          const loc = results?.[0]?.geometry?.location;
          if (loc && !cancelled) {
            setResolved((r) => ({ ...r, [i]: { lat: loc.lat(), lng: loc.lng() } }));
          }
        } catch {
          /* keep the model's coordinates */
        }
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, spots, regionHint]);

  const pins = useMemo(
    () =>
      spots
        .map((s, i) => {
          const r = resolved[i];
          return {
            i,
            s,
            lat: r ? r.lat : s.latitude,
            lng: r ? r.lng : s.longitude,
          };
        })
        .filter((p) => typeof p.lat === "number" && typeof p.lng === "number"),
    [spots, resolved],
  );

  const fitPins = (map: google.maps.Map) => {
    if (!pins.length) return;
    const bounds = new google.maps.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.lat!, lng: p.lng! }));
    if (pins.length === 1) map.setZoom(12);
    map.fitBounds(bounds, 48);
  };

  const fitAll = (map: google.maps.Map) => {
    mapRef.current = map;
    fitPins(map);
  };

  // Re-fit whenever geocoding lands more accurate coordinates
  useEffect(() => {
    if (mapRef.current) fitPins(mapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  useEffect(() => {
    if (selected == null || !mapRef.current) return;
    const p = pins.find((x) => x.i === selected);
    if (p) mapRef.current.panTo({ lat: p.lat!, lng: p.lng! });
  }, [selected, pins]);

  return (
    <div className="space-y-3 pt-1">
      {pins.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-border h-56 bg-surface">
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={{ lat: pins[0].lat!, lng: pins[0].lng! }}
              zoom={9}
              onLoad={fitAll}
              options={{
                gestureHandling: "greedy",
                disableDefaultUI: true,
                zoomControl: true,
                mapTypeId: "hybrid",
              }}
            >
              {pins.map(({ i, lat, lng }) => (
                <Marker
                  key={i}
                  position={{ lat: lat!, lng: lng! }}
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
