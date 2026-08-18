import { useState, useEffect } from "react";
import { MapPin, Calendar, ChevronRight, Loader2, Fish, Clock, Trophy } from "lucide-react";
import { format } from "date-fns";
import { fetchUserSpots, fetchPastInsights, type SpotLite, type PlannerIntake, type PastInsights } from "@/lib/planTrip";

interface Props {
  intake: PlannerIntake;
  onBack: () => void;
  onComplete: (spot: SpotLite, date: string) => void;
}

const SpotPickerStep = ({ intake, onBack, onComplete }: Props) => {
  const [spots, setSpots] = useState<SpotLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<SpotLite | null>(null);
  const [date, setDate] = useState(intake.date || format(new Date(), "yyyy-MM-dd"));
  const [insights, setInsights] = useState<PastInsights | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    fetchUserSpots()
      .then(setSpots)
      .catch(() => toast.error("Failed to load spots"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSpot) return;
    setInsightLoading(true);
    setInsights(null);
    fetchPastInsights(selectedSpot.id)
      .then(setInsights)
      .catch(() => {})
      .finally(() => setInsightLoading(false));
  }, [selectedSpot]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Spot list view
  if (!selectedSpot) {
    return (
      <div className="space-y-4">
        <div className="pt-4">
          <h2 className="text-xl font-bold text-foreground">Pick a spot</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose where you'll fish</p>
        </div>

        <div className="space-y-2">
          {spots.map((spot) => (
            <button
              key={spot.id}
              onClick={() => setSelectedSpot(spot)}
              className="w-full text-left p-4 rounded-xl bg-surface border border-border active:bg-surface/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {spot.name || spot.body_of_water}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {spot.body_of_water} · {spot.site_type}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onBack}
          className="w-full py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground active:bg-surface transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  // Spot detail + date picker view
  return (
    <div className="space-y-4">
      <div className="pt-4">
        <button
          onClick={() => setSelectedSpot(null)}
          className="text-sm text-muted-foreground active:text-foreground mb-2"
        >
          ← Back to spots
        </button>
        <h2 className="text-xl font-bold text-foreground">
          {selectedSpot.name || selectedSpot.body_of_water}
        </h2>
        <p className="text-sm text-muted-foreground">
          {selectedSpot.body_of_water} · {selectedSpot.site_type}
        </p>
      </div>

      {/* Date picker */}
      <div className="p-4 rounded-xl bg-surface border border-border">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
          <Calendar className="w-3.5 h-3.5" />
          Trip date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-transparent text-foreground text-lg font-semibold outline-none"
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* Past insights */}
      {insightLoading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading trip history…
        </div>
      ) : insights && insights.totalTrips > 0 ? (
        <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Trophy className="w-4 h-4 text-primary" />
            Past insights ({insights.totalTrips} trips)
          </div>
          {insights.topSpecies.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Fish className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Top species:</span>
              <span className="font-medium text-foreground">{insights.topSpecies.join(", ")}</span>
            </div>
          )}
          {insights.bestHours.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Best hours:</span>
              <span className="font-medium text-foreground">{insights.bestHours.join(", ")}</span>
            </div>
          )}
          {insights.topTackle.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Top tackle:</span>
              <span className="font-medium text-foreground">{insights.topTackle.join(", ")}</span>
            </div>
          )}
        </div>
      ) : insights && insights.totalTrips === 0 ? (
        <div className="p-4 rounded-xl bg-surface border border-border text-sm text-muted-foreground">
          No past trips at this spot yet — the AI will plan based on conditions.
        </div>
      ) : null}

      <button
        onClick={() => onComplete(selectedSpot, date)}
        className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5"
      >
        Generate plan
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default SpotPickerStep;
