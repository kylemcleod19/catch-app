import { useEffect, useRef, useState } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/lib/googleMaps";

export interface PlanPin {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  kind: "suggestion" | "water" | "station" | "spot" | "custom";
}

interface Props {
  center: { lat: number; lng: number };
  pins: PlanPin[];
  selectedId?: string | null;
  onPinClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  height?: string;
  zoom?: number;
}

const COLORS: Record<PlanPin["kind"], string> = {
  suggestion: "#F97316",
  spot: "#F97316",
  custom: "#F97316",
  water: "#3182CE",
  station: "#38A169",
};

let cachedKey: string | null = null;

/** Shared planner map: area, suggestion pins, nearby waters and stations. */
const PlanMap = ({ center, pins, selectedId, onPinClick, onMapClick, height = "h-64", zoom = 10 }: Props) => {
  const [apiKey, setApiKey] = useState<string | null>(cachedKey);
  const mapRef = useRef<google.maps.Map | null>(null);
  const { isLoaded } = useGoogleMaps(apiKey);

  useEffect(() => {
    if (cachedKey) return;
    supabase.functions.invoke("google-maps-key").then(({ data }) => {
      if (data?.key) {
        cachedKey = data.key;
        setApiKey(data.key);
      }
    });
  }, []);

  const fit = () => {
    const m = mapRef.current;
    if (!m) return;
    if (pins.length < 1) {
      m.setCenter(center);
      m.setZoom(zoom);
      return;
    }
    const b = new google.maps.LatLngBounds();
    b.extend(center);
    pins.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
    m.fitBounds(b, 40);
    google.maps.event.addListenerOnce(m, "idle", () => {
      if ((m.getZoom() || 0) > 15) m.setZoom(15);
    });
  };

  useEffect(fit, [pins.map((p) => p.id + p.lat + p.lng).join("|"), center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const LEGEND: Record<PlanPin["kind"], string> = {
    spot: "Your spot",
    custom: "Your pin",
    suggestion: "Suggested spot",
    water: "Monitored water",
    station: "Monitoring station",
  };
  const kinds = Array.from(new Set(pins.map((p) => p.kind)));

  return (
    <div className={`relative rounded-xl overflow-hidden border border-border bg-surface ${height}`}>
      {kinds.length > 0 && (
        <div className="absolute left-2 top-2 z-10 flex flex-col gap-1 rounded-lg bg-background/90 px-2 py-1.5 text-[11px] text-foreground shadow">
          {kinds.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-foreground" style={{ backgroundColor: COLORS[k] }} />
              {LEGEND[k]}
            </span>
          ))}
        </div>
      )}
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={center}
          zoom={zoom}
          onLoad={(m) => {
            mapRef.current = m;
            fit();
          }}
          onClick={(e) => e.latLng && onMapClick?.(e.latLng.lat(), e.latLng.lng())}
          options={{ gestureHandling: "greedy", disableDefaultUI: true, zoomControl: true, mapTypeId: "hybrid" }}
        >
          {pins.map((p) => {
            const sel = p.id === selectedId;
            return (
              <Marker
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                onClick={() => onPinClick?.(p.id)}
                zIndex={sel ? 20 : p.kind === "suggestion" ? 10 : 1}
                label={p.label ? { text: p.label, color: "#fff", fontWeight: "700", fontSize: "12px" } : undefined}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: p.kind === "suggestion" || p.kind === "spot" || p.kind === "custom" ? (sel ? 13 : 11) : 7,
                  fillColor: COLORS[p.kind],
                  fillOpacity: 1,
                  strokeColor: "#000",
                  strokeWeight: sel ? 3 : 2,
                }}
              />
            );
          })}
        </GoogleMap>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
};

export default PlanMap;
