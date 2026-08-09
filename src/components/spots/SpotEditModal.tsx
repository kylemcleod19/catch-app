import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getStateName } from "@/lib/us-states";
import {
  ChevronLeft, Loader2, MapPin, Plus, X, Move,
} from "lucide-react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/lib/googleMaps";
import PlacesAutocomplete from "./PlacesAutocomplete";
import HoleNamingPrompt from "./HoleNamingPrompt";

const LIBRARIES: ("places")[] = ["places"];
const PIN_COLORS = [
  "#E53E3E", "#3182CE", "#38A169", "#D69E2E", "#9F7AEA",
  "#ED64A6", "#DD6B20", "#319795", "#5A67D8", "#B83280",
];
const getPinColor = (idx: number) => PIN_COLORS[idx % PIN_COLORS.length];

const pinSvgIcon = (color: string, label: string) =>
  "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="${color}"/>
      <text x="16" y="20" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial">${label}</text>
    </svg>`
  );

interface SpotPoint {
  id?: string;
  label: string;
  latitude: number;
  longitude: number;
}

interface SpotEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spot: {
    id: string;
    name: string | null;
    body_of_water: string;
    state_code: string;
    spot_points: { id: string; label: string; latitude: number; longitude: number }[];
  };
  onUpdated: () => void;
}

type MapStage = "navigate" | "pin";

const SpotEditModal = ({ open, onOpenChange, spot, onUpdated }: SpotEditModalProps) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapStage, setMapStage] = useState<MapStage>("navigate");
  const [pendingPinCoords, setPendingPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [editName, setEditName] = useState(spot.name || "");
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  // Local copy of points for display; DB is source of truth
  const [points, setPoints] = useState<SpotPoint[]>(spot.spot_points);

  useEffect(() => {
    setPoints(spot.spot_points);
    setEditName(spot.name || "");
  }, [spot]);

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  const handleAddPin = async (label: string) => {
    if (!pendingPinCoords) return;
    const { error } = await supabase.from("spot_points").insert({
      spot_id: spot.id,
      label,
      latitude: pendingPinCoords.lat,
      longitude: pendingPinCoords.lng,
    } as any);
    if (error) {
      toast.error("Failed to add point");
    } else {
      toast.success("Point added");
      onUpdated();
    }
    setPendingPinCoords(null);
    setMapStage("navigate");
  };

  const handleRemovePin = async (idx: number) => {
    const point = points[idx];
    if (!point.id) return;
    const { error } = await supabase.from("spot_points").delete().eq("id", point.id);
    if (error) {
      toast.error("Failed to remove point");
    } else {
      toast.success("Point removed");
      onUpdated();
    }
  };

  const handleRename = async () => {
    setSaving(true);
    const { error } = await supabase.from("spots").update({ name: editName || null } as any).eq("id", spot.id);
    if (error) {
      toast.error("Failed to rename");
    } else {
      toast.success("Spot renamed");
      onUpdated();
    }
    setSaving(false);
  };

  const handlePlaceSelected = useCallback((place: { name: string; lat: number; lng: number }) => {
    mapRef.current?.panTo({ lat: place.lat, lng: place.lng });
    mapRef.current?.setZoom(14);
  }, []);

  const isNavigate = mapStage === "navigate";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full w-full h-[100dvh] max-h-[100dvh] z-[60] p-0 border-0 rounded-none [&>button]:hidden overflow-hidden">
        <div className="relative w-full h-full flex flex-col">
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50 safe-area-top">
            <div className="px-3 pt-2 pb-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Spot name"
                      className="h-7 rounded-lg text-sm font-semibold flex-1 max-w-[200px]"
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
                      onBlur={() => {
                        if (editName !== (spot.name || "")) handleRename();
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{spot.body_of_water} · {getStateName(spot.state_code)}</p>
                </div>
              </div>

              <PlacesAutocomplete onPlaceSelected={handlePlaceSelected} />

              {points.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {points.map((p, i) => (
                    <span key={p.id || i} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs text-white" style={{ backgroundColor: getPinColor(i) }}>
                      <MapPin className="w-3 h-3" />
                      {p.label}
                      <button type="button" onClick={() => handleRemovePin(i)} className="text-white/70 hover:text-white p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Map */}
          <div className="flex-1">
            {apiKey ? (
              <EditMap
                apiKey={apiKey}
                mapRef={mapRef}
                points={points}
                isNavigate={isNavigate}
                isSatellite={isSatellite}
                onMapClick={(coords) => {
                  if (!isNavigate) setPendingPinCoords(coords);
                }}
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-sm text-muted-foreground">
                Map unavailable
              </div>
            )}
          </div>

          {/* Naming prompt overlay */}
          {pendingPinCoords && !isNavigate && (
            <HoleNamingPrompt
              holeCount={points.length}
              onConfirm={handleAddPin}
              onCancel={() => { setPendingPinCoords(null); setMapStage("navigate"); }}
            />
          )}

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-background/90 backdrop-blur-md border-t border-border/50 safe-area-bottom">
            <div className="px-3 py-3 flex items-center justify-between">
              <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => onOpenChange(false)}>
                <ChevronLeft className="w-4 h-4" /> Done
              </Button>

              <div className="flex items-center gap-1.5">
                <Button
                  variant={isSatellite ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl text-xs px-2.5"
                  onClick={() => setIsSatellite(!isSatellite)}
                >
                  {isSatellite ? "Map" : "Satellite"}
                </Button>

                {isNavigate ? (
                  <Button size="sm" className="rounded-xl gap-1" onClick={() => setMapStage("pin")}>
                    <Plus className="w-4 h-4" /> Add Pin
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => setMapStage("navigate")}>
                    <Move className="w-4 h-4" /> Pan
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ─── Edit Map Inner ─── */

const EditMap = ({
  apiKey, mapRef, points, isNavigate, isSatellite, onMapClick,
}: {
  apiKey: string;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  points: SpotPoint[];
  isNavigate: boolean;
  isSatellite: boolean;
  onMapClick: (coords: { lat: number; lng: number }) => void;
}) => {
  const { isLoaded } = useGoogleMaps(apiKey);

  const center = points.length > 0
    ? { lat: points[0].latitude, lng: points[0].longitude }
    : { lat: 32.87, lng: -97.34 };

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setMapTypeId(isSatellite ? "satellite" : "roadmap");
  }, [isSatellite, mapRef]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setOptions({
      gestureHandling: isNavigate ? "greedy" : "none",
      zoomControl: isNavigate,
      draggable: isNavigate,
      scrollwheel: isNavigate,
      disableDoubleClickZoom: !isNavigate,
    });
  }, [isNavigate, mapRef]);

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
      onLoad={(map) => {
        mapRef.current = map;
        map.setMapTypeId(isSatellite ? "satellite" : "roadmap");
        map.setOptions({
          gestureHandling: isNavigate ? "greedy" : "none",
          zoomControl: isNavigate,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          draggable: isNavigate,
          scrollwheel: isNavigate,
          disableDoubleClickZoom: !isNavigate,
        });

        if (points.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          points.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
          map.fitBounds(bounds, 60);
        } else {
          map.setCenter(center);
          map.setZoom(6);
        }
      }}
      onUnmount={() => { mapRef.current = null; }}
      onClick={(e) => {
        if (!isNavigate && e.latLng) {
          onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      }}
    >
      {points.map((p, i) => (
        <Marker
          key={p.id || i}
          position={{ lat: p.latitude, lng: p.longitude }}
          title={p.label}
          icon={{
            url: pinSvgIcon(getPinColor(i), String(i + 1)),
            scaledSize: new google.maps.Size(32, 40),
            anchor: new google.maps.Point(16, 40),
          }}
        />
      ))}
    </GoogleMap>
  );
};

export default SpotEditModal;
