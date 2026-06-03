import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import BottomNav from "@/components/BottomNav";
import SpotCreationModal, { CreatedSpot } from "@/components/spots/SpotCreationModal";
import SpotEditModal from "@/components/spots/SpotEditModal";
import SpotWaterConditions from "@/components/spots/SpotWaterConditions";
import SpotWeatherForecast from "@/components/spots/SpotWeatherForecast";
import { Button } from "@/components/ui/button";
import { MapPin, Plus, Loader2, Trash2, Fish, Pencil, Play, Droplets, ChevronDown, CloudSun } from "lucide-react";

import { getStateName } from "@/lib/us-states";
import { toast } from "sonner";

const DRAFT_KEY = "draftTripId";

const PIN_COLORS = [
  "#E53E3E", "#3182CE", "#38A169", "#D69E2E", "#9F7AEA",
  "#ED64A6", "#DD6B20", "#319795", "#5A67D8", "#B83280",
];
const getPinColor = (idx: number) => PIN_COLORS[idx % PIN_COLORS.length];

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
  const navigate = useNavigate();
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSpot, setEditingSpot] = useState<SpotRow | null>(null);
  const [conditionsOpen, setConditionsOpen] = useState<Record<string, boolean>>({});
  const [startingTripId, setStartingTripId] = useState<string | null>(null);

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

  // Keep editingSpot in sync after fetches
  useEffect(() => {
    if (editingSpot) {
      const updated = spots.find((s) => s.id === editingSpot.id);
      if (updated) setEditingSpot(updated);
    }
  }, [spots]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("spots").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete spot");
    } else {
      setSpots((prev) => prev.filter((s) => s.id !== id));
      toast.success("Spot deleted");
    }
  };

  const handleStartTrip = async (spot: SpotRow) => {
    if (!user) return;
    if (localStorage.getItem(DRAFT_KEY)) {
      toast.error("You already have a trip in progress. Finish or cancel it first.");
      navigate("/");
      return;
    }
    setStartingTripId(spot.id);
    const { data, error } = await supabase
      .from("fishing_trips")
      .insert({
        user_id: user.id,
        title: `Trip to ${spot.name || spot.body_of_water}`,
        status: "draft",
        spot_id: spot.id,
      } as any)
      .select("id")
      .single();
    setStartingTripId(null);
    if (error || !data) {
      toast.error("Failed to start trip");
      return;
    }
    localStorage.setItem(DRAFT_KEY, data.id);
    toast.success("Trip started");
    navigate("/");
  };

  const toggleConditions = (id: string) =>
    setConditionsOpen((prev) => ({ ...prev, [id]: !prev[id] }));

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
                    {spot.body_of_water} · {getStateName(spot.state_code)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingSpot(spot)}
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

              {/* Summary points */}
              {spot.spot_points.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {spot.spot_points.map((p, i) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white"
                      style={{ backgroundColor: getPinColor(i) }}
                    >
                      <MapPin className="w-3 h-3" /> {p.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="catch"
                  className="flex-1 h-9 gap-1.5 rounded-lg"
                  disabled={startingTripId === spot.id}
                  onClick={() => handleStartTrip(spot)}
                >
                  {startingTripId === spot.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Start Trip
                </Button>
                {spot.usgs_site_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 gap-1.5 rounded-lg"
                    onClick={() => toggleConditions(spot.id)}
                  >
                    <Droplets className="w-4 h-4" />
                    Conditions
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${conditionsOpen[spot.id] ? "rotate-180" : ""}`}
                    />
                  </Button>
                )}
              </div>

              {conditionsOpen[spot.id] && spot.usgs_site_id && (
                <SpotWaterConditions usgsSiteId={spot.usgs_site_id} />
              )}
            </div>
          ))
        )}
      </main>


      <SpotCreationModal open={createOpen} onOpenChange={setCreateOpen} onSpotCreated={() => fetchSpots()} />
      {editingSpot && (
        <SpotEditModal
          open={!!editingSpot}
          onOpenChange={(open) => { if (!open) setEditingSpot(null); }}
          spot={editingSpot}
          onUpdated={fetchSpots}
        />
      )}
      <BottomNav />
    </div>
  );
};

export default SpotsPage;
