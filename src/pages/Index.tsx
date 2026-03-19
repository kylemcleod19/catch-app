import { useState, useEffect, useCallback } from "react";
import { Plus, CalendarPlus, MapPin, Fish, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import WeatherHeader from "@/components/WeatherHeader";
import TripLogForm from "@/components/trip-log/TripLogForm";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const DRAFT_KEY = "draftTripId";

const RecentTripCard = ({ title, location, date, catchCount, onClick }: { title: string; location: string; date: string; catchCount: number; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full catch-card flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer text-left"
  >
    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      <Fish className="w-6 h-6 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium tracking-tight text-card-foreground truncate">{title}</p>
      <div className="flex items-center gap-3 mt-0.5">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3" />
          {location}
        </span>
        <span className="text-xs text-muted-foreground">{date}</span>
      </div>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <span className="catch-data text-sm font-semibold text-card-foreground">{catchCount}</span>
      <span className="text-xs text-muted-foreground">fish</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
    </div>
  </button>
);

interface RecentTrip {
  id: string;
  title: string;
  location: string;
  date: string;
  catchCount: number;
}

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [draftTripId, setDraftTripId] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [checkingDraft, setCheckingDraft] = useState(true);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [draftTripId, setDraftTripId] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [checkingDraft, setCheckingDraft] = useState(true);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);

  const fetchRecentTrips = useCallback(async () => {
    if (!user) return;
    setLoadingTrips(true);
    const { data: trips } = await supabase
      .from("fishing_trips")
      .select("id, title, location_name, started_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(5);

    if (trips) {
      // Fetch catch counts for these trips
      const tripIds = trips.map((t) => t.id);
      const { data: catches } = await supabase
        .from("catches")
        .select("trip_id, quantity")
        .in("trip_id", tripIds);

      const countMap: Record<string, number> = {};
      catches?.forEach((c) => {
        countMap[c.trip_id] = (countMap[c.trip_id] || 0) + c.quantity;
      });

      setRecentTrips(
        trips.map((t) => ({
          id: t.id,
          title: t.title || "Untitled Trip",
          location: t.location_name || "Unknown",
          date: format(new Date(t.started_at), "MMM d"),
          catchCount: countMap[t.id] || 0,
        }))
      );
    }
    setLoadingTrips(false);
  }, [user]);

  // On mount, check for an existing draft trip
  useEffect(() => {
    if (!user) {
      setCheckingDraft(false);
      return;
    }
    const stored = localStorage.getItem(DRAFT_KEY);
    if (stored) {
      supabase
        .from("fishing_trips")
        .select("id")
        .eq("id", stored)
        .eq("user_id", user.id)
        .filter("status", "eq", "draft")
        .single()
        .then(({ data }) => {
          if (data) {
            setDraftTripId(stored);
            setIsLogging(true);
          } else {
            localStorage.removeItem(DRAFT_KEY);
          }
          setCheckingDraft(false);
        });
    } else {
      setCheckingDraft(false);
    }
    fetchRecentTrips();
  }, [user, fetchRecentTrips]);

  const handleStartLogging = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("fishing_trips")
      .insert({
        user_id: user.id,
        title: `Trip on ${format(new Date(), "MMM d")}`,
        status: "draft",
      } as any)
      .select("id")
      .single();

    if (data && !error) {
      localStorage.setItem(DRAFT_KEY, data.id);
      setDraftTripId(data.id);
      setIsLogging(true);
    }
  };

  const handleComplete = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftTripId(null);
    setIsLogging(false);
    fetchRecentTrips();
  };

  const handleCancel = async () => {
    if (draftTripId) {
      await supabase.from("fishing_trips").delete().eq("id", draftTripId);
    }
    localStorage.removeItem(DRAFT_KEY);
    setDraftTripId(null);
    setIsLogging(false);
  };

  if (checkingDraft) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">CATCH</h1>
            <p className="text-xs text-muted-foreground tracking-wide">Fishing Log</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {isLogging && draftTripId ? (
          <TripLogForm tripId={draftTripId} onClose={handleCancel} onSuccess={handleComplete} />
        ) : (
          <>
            <WeatherHeader />

            {/* Primary Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="catch" size="lg" className="w-full gap-2" onClick={handleStartLogging}>
                <Plus className="w-5 h-5" />
                Log Trip
              </Button>
              <Button variant="outline" size="lg" className="w-full gap-2 rounded-xl" onClick={() => navigate("/trips")}>
                <CalendarPlus className="w-5 h-5" />
                Plan Trip
              </Button>
            </div>

            {/* Recent Trips */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">Recent Trips</h2>
                <button
                  onClick={() => navigate("/trips")}
                  className="text-xs font-medium text-primary active:text-primary/70 transition-colors"
                >
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {loadingTrips ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : recentTrips.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No trips yet. Tap "Log Trip" to get started!
                  </div>
                ) : (
                  recentTrips.map((trip) => (
                    <RecentTripCard key={trip.id} {...trip} onClick={() => setEditingTripId(trip.id)} />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Index;
