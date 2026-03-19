import { useState, useEffect, useCallback } from "react";
import { Fish, MapPin, Loader2, ChevronRight, Plus } from "lucide-react";
import { format } from "date-fns";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import TripLogForm from "@/components/trip-log/TripLogForm";

interface TripWithDetails {
  id: string;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  spot_id: string | null;
  notes: string | null;
  spotName: string | null;
  bodyOfWater: string | null;
  catchCount: number;
  topSpecies: string[];
}

function generateTripName(trip: TripWithDetails): string {
  const parts: string[] = [];

  // Water body or spot name
  if (trip.bodyOfWater) {
    parts.push(trip.bodyOfWater);
  } else if (trip.spotName) {
    parts.push(trip.spotName);
  }

  // Date
  parts.push(format(new Date(trip.started_at), "MMM d"));

  // Top species
  if (trip.topSpecies.length > 0) {
    const speciesStr = trip.topSpecies.slice(0, 2).join(" & ");
    parts.push(`– ${speciesStr}`);
  }

  return parts.join(" · ") || `Trip on ${format(new Date(trip.started_at), "MMM d")}`;
}

const TripsPage = () => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<TripWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);

  const fetchTrips = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch all completed trips with spot info
    const { data: tripsData } = await supabase
      .from("fishing_trips")
      .select("id, title, started_at, ended_at, status, spot_id, notes")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("started_at", { ascending: false });

    if (!tripsData || tripsData.length === 0) {
      setTrips([]);
      setLoading(false);
      return;
    }

    const tripIds = tripsData.map((t) => t.id);
    const spotIds = tripsData.map((t) => t.spot_id).filter(Boolean) as string[];

    // Fetch spots and catches in parallel
    const [spotsRes, catchesRes] = await Promise.all([
      spotIds.length > 0
        ? supabase.from("spots").select("id, name, body_of_water").in("id", spotIds)
        : Promise.resolve({ data: [] }),
      supabase.from("catches").select("trip_id, quantity, species").in("trip_id", tripIds),
    ]);

    const spotMap = new Map<string, { name: string | null; body_of_water: string }>();
    spotsRes.data?.forEach((s) => spotMap.set(s.id, s));

    // Build catch counts and top species per trip
    const catchCountMap: Record<string, number> = {};
    const speciesMap: Record<string, Record<string, number>> = {};
    catchesRes.data?.forEach((c) => {
      catchCountMap[c.trip_id] = (catchCountMap[c.trip_id] || 0) + c.quantity;
      if (!speciesMap[c.trip_id]) speciesMap[c.trip_id] = {};
      speciesMap[c.trip_id][c.species] = (speciesMap[c.trip_id][c.species] || 0) + c.quantity;
    });

    const enriched: TripWithDetails[] = tripsData.map((t) => {
      const spot = t.spot_id ? spotMap.get(t.spot_id) : undefined;
      const speciesCounts = speciesMap[t.id] || {};
      const topSpecies = Object.entries(speciesCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([name]) => name);

      return {
        ...t,
        spotName: spot?.name ?? null,
        bodyOfWater: spot?.body_of_water ?? null,
        catchCount: catchCountMap[t.id] || 0,
        topSpecies,
      };
    });

    setTrips(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  if (editingTripId) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <main className="max-w-lg mx-auto px-4 pt-4">
          <TripLogForm
            tripId={editingTripId}
            onClose={() => setEditingTripId(null)}
            onSuccess={() => {
              setEditingTripId(null);
              fetchTrips();
            }}
          />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight text-foreground">My Trips</h1>
          <span className="text-xs text-muted-foreground">
            {!loading && `${trips.length} trip${trips.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center text-center pt-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Fish className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">No trips yet</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Log your first fishing trip from the dashboard to start building your history.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {trips.map((trip) => {
              const displayName = generateTripName(trip);
              const locationLabel = trip.bodyOfWater || trip.spotName || "No spot";

              return (
                <button
                  key={trip.id}
                  onClick={() => setEditingTripId(trip.id)}
                  className="w-full catch-card flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer text-left"
                >
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Fish className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium tracking-tight text-card-foreground truncate">
                      {displayName}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {locationLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(trip.started_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm font-semibold text-card-foreground">{trip.catchCount}</span>
                    <span className="text-xs text-muted-foreground">fish</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default TripsPage;
