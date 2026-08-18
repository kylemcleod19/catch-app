import { useState } from "react";
import { Loader2, Compass, ChevronRight, AlertCircle } from "lucide-react";
import { exploreArea, type PlannerIntake, type ExploreResult, type CandidateSpot } from "@/lib/planTrip";

interface Props {
  intake: PlannerIntake;
  onBack: () => void;
  onComplete: (result: ExploreResult) => void;
}

const AreaExplorerStep = ({ intake, onBack, onComplete }: Props) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExploreResult | null>(null);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await exploreArea({ intake });
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate on mount
  if (!loading && !result && !error) {
    // trigger once
    setTimeout(() => {
      if (!loading && !result) generate();
    }, 0);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Finding waters near {intake.location_query || "your area"}…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-600 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
        <button
          onClick={generate}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold active:scale-95 transition-all"
        >
          Try again
        </button>
        <button
          onClick={onBack}
          className="w-full py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground"
        >
          Back
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-4">
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-1">
          <Compass className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Candidate spots</h2>
        </div>
        {result.summary && (
          <p className="text-sm text-muted-foreground">{result.summary}</p>
        )}
      </div>

      <div className="space-y-3">
        {result.spots.map((spot: CandidateSpot, i: number) => (
          <div key={i} className="p-4 rounded-xl bg-surface border border-border space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground">{spot.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize shrink-0">
                {spot.water_type}
              </span>
            </div>
            {spot.species?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Species: {spot.species.join(", ")}
              </p>
            )}
            <p className="text-sm text-foreground/80">{spot.why}</p>
            {spot.access && (
              <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {spot.access} access
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground active:bg-surface transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => onComplete(result)}
          className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold active:scale-95 transition-all flex items-center justify-center gap-1"
        >
          Save plan
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default AreaExplorerStep;
