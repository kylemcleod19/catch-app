import { SPOT_TYPE_SELECT, flattenSpots } from "@/lib/spotData";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import BottomNav from "@/components/BottomNav";
import SpotCreationModal, { CreatedSpot } from "@/components/spots/SpotCreationModal";
import SpotEditModal from "@/components/spots/SpotEditModal";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Trash2, Fish, Pencil, Play, ChevronDown, History, CloudSun, Droplets } from "lucide-react";

import { getStateName } from "@/lib/us-states";
import { toast } from "sonner";

const DRAFT_KEY = "draftTripId";

interface SpotRow {
  id: string;
  name: string | null;
  body_of_water: string;
  state_code: string;
  site_type: string;
  usgs_site_id: string | null;
  spot_points: { id: string; label: string; latitude: number; longitude: number }[];
}

interface SpotStats {
  tripCount: number;
  fishCount: number;
}

interface CurrentConditions {
  tempF: number | null;
  flowCfs: number | null;
}

const useSpotConditions = (spot: SpotRow | null) => {
  const [conditions, setConditions] = useState<CurrentConditions>({ tempF: null, flowCfs: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!spot) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const result: CurrentConditions = { tempF: null, flowCfs: null };

      // Weather from first pin
      if (spot.spot_points.length > 0) {
        try {
          const { latitude, longitude } = spot.spot_points[0];
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=fahrenheit&wind_speed_unit=mph`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            result.tempF = data?.current_weather?.temperature ?? null;
          }
        } catch {
          // ignore
        }
      }

      // Water flow from cache or API
      if (spot.usgs_site_id) {
        try {
          const dateStr = new Date().toISOString().split("T")[0];
          const { data: cached } = await supabase
            .from("water_data_cache")
            .select("response_json")
            .eq("monitoring_location_id", spot.usgs_site_id)
            .eq("date", dateStr)
            .maybeSingle();

          let resultData: any = null;
          if (cached?.response_json) {
            resultData = cached.response_json;
          } else {
            const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
            const url = `https://${projectId}.supabase.co/functions/v1/water-data?monitoring_location_id=${encodeURIComponent(
              spot.usgs_site_id
            )}&date=${dateStr}`;
            const resp = await fetch(url, {
              headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            });
            if (resp.ok) resultData = await resp.json();
          }

          const series: any[] = resultData?.historical?.discharge?.series || [];
          if (series.length > 0) {
            const latest = series[series.length - 1];
            result.flowCfs = latest.value != null ? Math.round(parseFloat(latest.value)) : null;
          }
        } catch {
          // ignore
        }
      }

      if (!cancelled) {
        setConditions(result);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [spot?.id, spot?.usgs_site_id, spot?.spot_points?.length]);

  return { conditions, loading };
};

const SpotsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [stats, setStats] = useState<Record<string, SpotStats>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSpot, setEditingSpot] = useState<SpotRow | null>(null);
  const [startingTripId, setStartingTripId] = useState<string | null>(null);

  const fetchSpots = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("spots")
      .select(`id, name, body_of_water, state_code, site_type, spot_points(id, label, latitude, longitude), ${SPOT_TYPE_SELECT}`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }) as any;
    const spotsData: SpotRow[] = flattenSpots(data) as any;

    setSpots(spotsData);

    // Bulk fetch trip and catch stats
    if (spotsData.length > 0) {
      const spotIds = spotsData.map((s) => s.id);
      const { data: tripsData } = await supabase
        .from("fishing_trips")
        .select("id, spot_id")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .in("spot_id", spotIds);

      const tripIds = (tripsData || []).map((t) => t.id);
      const tripSpotMap: Record<string, string> = {};
      (tripsData || []).forEach((t) => { tripSpotMap[t.id] = t.spot_id; });

      let catchCounts: Record<string, number> = {};
      if (tripIds.length > 0) {
        const { data: catchesData } = await supabase
          .from("catches")
          .select("trip_id, quantity")
          .in("trip_id", tripIds);
        (catchesData || []).forEach((c) => {
          const spotId = tripSpotMap[c.trip_id];
          if (spotId) {
            catchCounts[spotId] = (catchCounts[spotId] || 0) + (c.quantity || 1);
          }
        });
      }

      const newStats: Record<string, SpotStats> = {};
      spotsData.forEach((s) => {
        const tripCount = (tripsData || []).filter((t) => t.spot_id === s.id).length;
        newStats[s.id] = {
          tripCount,
          fishCount: catchCounts[s.id] || 0,
        };
      });
      setStats(newStats);
    }

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
      setStats((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
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
            <SpotCard
              key={spot.id}
              spot={spot}
              stats={stats[spot.id] || { tripCount: 0, fishCount: 0 }}
              onNavigate={() => navigate(`/spots/${spot.id}`)}
              onStartTrip={() => handleStartTrip(spot)}
              onEdit={() => setEditingSpot(spot)}
              onDelete={() => handleDelete(spot.id)}
              starting={startingTripId === spot.id}
            />
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

const SpotCard = ({
  spot,
  stats,
  onNavigate,
  onStartTrip,
  onEdit,
  onDelete,
  starting,
}: {
  spot: SpotRow;
  stats: SpotStats;
  onNavigate: () => void;
  onStartTrip: () => void;
  onEdit: () => void;
  onDelete: () => void;
  starting: boolean;
}) => {
  const { conditions, loading: condLoading } = useSpotConditions(spot);

  return (
    <div className="catch-card space-y-2">
      <button
        type="button"
        onClick={onNavigate}
        className="w-full flex items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-card-foreground truncate">
            {spot.name || spot.body_of_water}
          </p>
          <p className="text-xs text-muted-foreground">
            {spot.body_of_water} · {getStateName(spot.state_code)}
          </p>
        </div>
        <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground shrink-0 mt-0.5" />
      </button>

      {/* Stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <History className="w-3.5 h-3.5" />
          <span className="font-medium text-foreground">{stats.tripCount}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Fish className="w-3.5 h-3.5" />
          <span className="font-medium text-foreground">{stats.fishCount}</span>
        </span>

        {condLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <>
            {conditions.tempF != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CloudSun className="w-3.5 h-3.5" />
                <span className="font-medium text-foreground">{Math.round(conditions.tempF)}°</span>
              </span>
            )}
            {conditions.flowCfs != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Droplets className="w-3.5 h-3.5" />
                <span className="font-medium text-foreground">{conditions.flowCfs} cfs</span>
              </span>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="catch"
          className="flex-1 h-9 gap-1.5 rounded-lg"
          disabled={starting}
          onClick={onStartTrip}
        >
          {starting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Start Trip
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3 rounded-lg"
          onClick={onEdit}
          aria-label="Edit"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3 rounded-lg text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default SpotsPage;
