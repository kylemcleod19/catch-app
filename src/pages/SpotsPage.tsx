import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import BottomNav from "@/components/BottomNav";
import SpotCreationModal, { CreatedSpot } from "@/components/spots/SpotCreationModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Plus, Loader2, Trash2, Fish, Pencil, Check, X } from "lucide-react";
import { getStateName } from "@/lib/us-states";
import { toast } from "sonner";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const LIBRARIES: ("places")[] = ["places"];

interface SpotRow {
  id: string;
  name: string | null;
  body_of_water: string;
  state_code: string;
  site_type: string;
  usgs_site_id: string | null;
  spot_points: { id: string; label: string; latitude: number; longitude: number }[];
}

const SpotsPage = () => {
  const { user } = useAuth();
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingPointSpotId, setAddingPointSpotId] = useState<string | null>(null);
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
      .select("id, name, body_of_water, state_code, site_type, usgs_site_id, spot_points(id, label, latitude, longitude)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }) as any;
    setSpots(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("spots").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete spot");
    } else {
      setSpots((prev) => prev.filter((s) => s.id !== id));
      toast.success("Spot deleted");
    }
  };

  const handleRename = async (id: string) => {
    const { error } = await supabase.from("spots").update({ name: editName || null } as any).eq("id", id);
    if (error) {
      toast.error("Failed to rename");
    } else {
      setSpots((prev) => prev.map((s) => s.id === id ? { ...s, name: editName || null } : s));
      toast.success("Spot renamed");
    }
    setEditingId(null);
  };

  const handleDeletePoint = async (pointId: string) => {
    const { error } = await supabase.from("spot_points").delete().eq("id", pointId);
    if (error) {
      toast.error("Failed to delete point");
    } else {
      fetchSpots();
      toast.success("Point removed");
    }
  };

  const handleAddPoint = async (e: google.maps.MapMouseEvent, spotId: string) => {
    if (!e.latLng) return;
    const { error } = await supabase.from("spot_points").insert({
      spot_id: spotId,
      label: newPointLabel || "Pin",
      latitude: e.latLng.lat(),
      longitude: e.latLng.lng(),
    } as any);
    if (error) {
      toast.error("Failed to add point");
    } else {
      toast.success("Point added!");
      setAddingPointSpotId(null);
      setNewPointLabel("New spot");
      fetchSpots();
    }
  };

  const handleCreated = () => {
    fetchSpots();
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight text-foreground">Spots</h1>
          <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New Spot
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : spots.length === 0 ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full py-12 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-3 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Fish className="w-8 h-8" />
            <span className="text-sm font-medium">Tap to add your first fishing spot</span>
          </button>
        ) : (
          spots.map((spot) => (
            <div key={spot.id} className="catch-card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-card-foreground truncate">
                    {spot.name || spot.body_of_water}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {spot.body_of_water} · {getStateName(spot.state_code)} · {spot.site_type}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => { const next = expandedId === spot.id ? null : spot.id; setExpandedId(next); if (next) setEditName(spot.name || ""); }}
                    className="text-muted-foreground hover:text-primary p-1"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(spot.id)}
                    className="text-muted-foreground hover:text-destructive p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded edit view */}
              {expandedId === spot.id && (
                <div className="space-y-3 pt-1 border-t border-border/50">
                  {/* Rename */}
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Spot name"
                      className="h-8 rounded-lg text-sm flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(spot.id);
                      }}
                    />
                    <Button size="sm" variant="outline" className="rounded-lg h-8 text-xs" onClick={() => handleRename(spot.id)}>
                      Rename
                    </Button>
                  </div>

                  {/* Points */}
                  {spot.spot_points.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {spot.spot_points.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-muted text-xs text-muted-foreground group"
                        >
                          <MapPin className="w-3 h-3 text-primary" /> {p.label}
                          <button
                            type="button"
                            onClick={() => handleDeletePoint(p.id)}
                            className="text-muted-foreground/50 hover:text-destructive p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add point */}
                  {addingPointSpotId === spot.id ? (
                    <div className="space-y-2">
                      <Input
                        placeholder="Label (e.g. new hole)"
                        value={newPointLabel}
                        onChange={(e) => setNewPointLabel(e.target.value)}
                        className="rounded-xl text-sm h-9"
                      />
                      <p className="text-xs text-muted-foreground">Tap the map to place the point</p>
                      <AddPointMap
                        apiKey={apiKey}
                        existingPoints={spot.spot_points}
                        onMapClick={(e) => handleAddPoint(e, spot.id)}
                        mapRef={mapRef}
                      />
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setAddingPointSpotId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs text-primary"
                      onClick={() => setAddingPointSpotId(spot.id)}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add a point
                    </Button>
                  )}
                </div>
              )}

              {/* Summary points when collapsed */}
              {expandedId !== spot.id && spot.spot_points.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {spot.spot_points.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3 text-primary" /> {p.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </main>

      <SpotCreationModal open={createOpen} onOpenChange={setCreateOpen} onSpotCreated={handleCreated} />
      <BottomNav />
    </div>
  );
};

/* ─── Inline map for adding a point ─── */

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
    return <div className="h-[200px] rounded-xl bg-muted flex items-center justify-center text-sm text-muted-foreground">Map unavailable</div>;
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
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, id: "google-map-script", libraries: LIBRARIES });

  const center = existingPoints.length > 0
    ? { lat: existingPoints[0].latitude, lng: existingPoints[0].longitude }
    : { lat: 32.87, lng: -97.34 };

  if (!isLoaded) {
    return <div className="h-[200px] rounded-xl bg-muted flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "max(40vh, 250px)", borderRadius: "0.75rem" }}
      center={center}
      zoom={existingPoints.length > 0 ? 13 : 6}
      onClick={onMapClick}
      onLoad={(map) => { mapRef.current = map; }}
      options={{ gestureHandling: "greedy", zoomControl: true, mapTypeControl: true, streetViewControl: false, fullscreenControl: false }}
    >
      {existingPoints.map((p, i) => (
        <Marker key={i} position={{ lat: p.latitude, lng: p.longitude }} title={p.label} opacity={0.5} />
      ))}
    </GoogleMap>
  );
};

export default SpotsPage;
