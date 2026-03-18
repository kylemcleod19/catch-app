import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Plus, Loader2, ChevronDown, X, Search } from "lucide-react";
import { getStateName } from "@/lib/us-states";
import SpotCreationModal, { CreatedSpot } from "./SpotCreationModal";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { toast } from "sonner";

interface SpotData {
  id: string;
  name: string | null;
  body_of_water: string;
  state_code: string;
  site_type: string;
  spot_points: { id: string; label: string; latitude: number; longitude: number }[];
}

interface SpotPickerProps {
  spotId: string | null;
  onSpotChange: (spotId: string | null) => void;
}

const mapStyle = { width: "100%", height: "200px", borderRadius: "0.75rem" };

const SpotPicker = ({ spotId, onSpotChange }: SpotPickerProps) => {
  const { user } = useAuth();
  const [spots, setSpots] = useState<SpotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<SpotData | null>(null);
  const [showList, setShowList] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Add point inline
  const [addingPoint, setAddingPoint] = useState(false);
  const [newPointLabel, setNewPointLabel] = useState("New spot");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  const fetchSpots = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("spots")
      .select("id, name, body_of_water, state_code, site_type, spot_points(id, label, latitude, longitude)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }) as any;
    setSpots(data || []);
    setLoading(false);

    // Load selected
    if (spotId && data) {
      const found = data.find((s: SpotData) => s.id === spotId);
      if (found) setSelectedSpot(found);
    }
  }, [user, spotId]);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  const handleSelect = (spot: SpotData) => {
    setSelectedSpot(spot);
    onSpotChange(spot.id);
    setShowList(false);
    setSearchQuery("");
  };

  const handleClear = () => {
    setSelectedSpot(null);
    onSpotChange(null);
  };

  const handleCreated = (spot: CreatedSpot) => {
    fetchSpots();
    onSpotChange(spot.id);
    setShowList(false);
  };

  const handleAddPoint = async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng || !selectedSpot) return;
    const pt = { label: newPointLabel || "Pin", latitude: e.latLng.lat(), longitude: e.latLng.lng() };
    const { error } = await supabase.from("spot_points").insert({
      spot_id: selectedSpot.id,
      ...pt,
    } as any);
    if (error) {
      toast.error("Failed to add point");
      return;
    }
    toast.success("Point added!");
    setAddingPoint(false);
    setNewPointLabel("New spot");
    fetchSpots();
  };

  const filteredSpots = searchQuery
    ? spots.filter(
        (s) =>
          s.body_of_water.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : spots;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Fishing Spot</label>

      {/* Selected spot display */}
      {selectedSpot ? (
        <div className="p-3 bg-card rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-medium text-sm text-card-foreground truncate">
                {selectedSpot.name || selectedSpot.body_of_water}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedSpot.body_of_water} · {getStateName(selectedSpot.state_code)} · {selectedSpot.site_type}
              </p>
            </div>
            <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-destructive p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Points */}
          {selectedSpot.spot_points.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedSpot.spot_points.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 text-primary" /> {p.label}
                </span>
              ))}
            </div>
          )}

          {/* Add new point */}
          {!addingPoint ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-primary"
              onClick={() => setAddingPoint(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Add a point
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Label (e.g. new hole)"
                value={newPointLabel}
                onChange={(e) => setNewPointLabel(e.target.value)}
                className="rounded-xl text-sm"
              />
              <p className="text-xs text-muted-foreground">Tap the map to place the point</p>
              <AddPointMap apiKey={apiKey} existingPoints={selectedSpot.spot_points} onMapClick={handleAddPoint} mapRef={mapRef} />
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setAddingPoint(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Spot selector */}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between rounded-xl"
            onClick={() => setShowList(!showList)}
          >
            <span className="text-muted-foreground">Select a spot</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </Button>

          {showList && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search spots..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-lg pl-8 h-9"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-border">
                {loading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSpots.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 text-center">No spots found</p>
                ) : (
                  filteredSpots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                      onClick={() => handleSelect(s)}
                    >
                      <p className="text-sm font-medium text-foreground truncate">{s.name || s.body_of_water}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.body_of_water} · {getStateName(s.state_code)} · {s.spot_points.length} point{s.spot_points.length !== 1 ? "s" : ""}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <div className="p-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-primary"
                  onClick={() => {
                    setShowList(false);
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" /> Create new spot
                </Button>
              </div>
            </div>
          )}

          {!showList && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-primary"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Create new spot
            </Button>
          )}
        </>
      )}

      <SpotCreationModal open={createOpen} onOpenChange={setCreateOpen} onSpotCreated={handleCreated} />
    </div>
  );
};

/** Inline map for adding a single point to an existing spot */
const AddPointMap = ({
  apiKey,
  existingPoints,
  onMapClick,
  mapRef,
}: {
  apiKey: string | null;
  existingPoints: { latitude: number; longitude: number; label: string }[];
  onMapClick: (e: google.maps.MapMouseEvent) => void;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
}) => {
  if (!apiKey) {
    return (
      <div className="h-[200px] rounded-xl bg-muted flex items-center justify-center text-sm text-muted-foreground">
        Map unavailable
      </div>
    );
  }
  return <AddPointMapInner apiKey={apiKey} existingPoints={existingPoints} onMapClick={onMapClick} mapRef={mapRef} />;
};

const AddPointMapInner = ({
  apiKey,
  existingPoints,
  onMapClick,
  mapRef,
}: {
  apiKey: string;
  existingPoints: { latitude: number; longitude: number; label: string }[];
  onMapClick: (e: google.maps.MapMouseEvent) => void;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
}) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, id: "google-map-script" });

  const center = existingPoints.length > 0
    ? { lat: existingPoints[0].latitude, lng: existingPoints[0].longitude }
    : { lat: 32.87, lng: -97.34 };

  if (!isLoaded) {
    return (
      <div className="h-[200px] rounded-xl bg-muted flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={mapStyle}
      center={center}
      zoom={existingPoints.length > 0 ? 13 : 6}
      onClick={onMapClick}
      onLoad={(map) => { mapRef.current = map; }}
      options={{ disableDefaultUI: true, zoomControl: true }}
    >
      {existingPoints.map((p, i) => (
        <Marker key={i} position={{ lat: p.latitude, lng: p.longitude }} title={p.label} opacity={0.5} />
      ))}
    </GoogleMap>
  );
};

export default SpotPicker;
