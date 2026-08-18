import { Loader2, Sun, CloudRain, Wind, Droplet, Waves, AlertCircle, Sunrise, Sunset } from "lucide-react";
import type { DayPlan, DayBlock } from "@/lib/planTrip";

interface Props {
  plan: DayPlan | null;
  loading: boolean;
  error: string;
  spotName: string;
  date: string;
  onRegenerate: () => void;
  onSave: () => void;
  onBack: () => void;
}

const FAVORABILITY: Record<string, { bg: string; text: string; label: string }> = {
  prime: { bg: "bg-primary", text: "text-white", label: "Prime" },
  good: { bg: "bg-primary/20", text: "text-primary", label: "Good" },
  fair: { bg: "bg-muted", text: "text-muted-foreground", label: "Fair" },
  poor: { bg: "bg-muted/50", text: "text-muted-foreground/70", label: "Poor" },
};

const DayPlanView = ({ plan, loading, error, spotName, date, onRegenerate, onSave, onBack }: Props) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Analyzing conditions and building your plan…</p>
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
          onClick={onRegenerate}
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

  if (!plan) return null;

  return (
    <div className="space-y-4 pb-8">
      <div className="pt-4">
        <h2 className="text-xl font-bold text-foreground">{spotName}</h2>
        <p className="text-sm text-muted-foreground">
          {new Date(date + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Summary */}
      {plan.summary && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
          <p className="text-sm text-foreground">{plan.summary}</p>
        </div>
      )}

      {/* Best window highlight */}
      {plan.best_window && (
        <div className="flex items-center gap-2 px-1">
          <Sunrise className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground">Best window:</span>
          <span className="text-sm font-semibold text-foreground">{plan.best_window}</span>
        </div>
      )}

      {/* Time blocks */}
      <div className="space-y-3">
        {plan.blocks.map((block: DayBlock, i: number) => {
          const fav = FAVORABILITY[block.favorability] || FAVORABILITY.fair;
          return (
            <div key={i} className="rounded-xl bg-surface border border-border overflow-hidden">
              <div className={`px-4 py-2 flex items-center justify-between ${fav.bg}`}>
                <span className={`text-sm font-semibold ${fav.text}`}>{block.window}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${fav.bg === "bg-primary" ? "bg-white/20" : "bg-background"} ${fav.text}`}>
                  {fav.label}
                </span>
              </div>
              <div className="p-4 space-y-2">
                <p className="text-sm text-foreground/80">{block.conditions}</p>
                {block.target_species && (
                  <p className="text-xs text-muted-foreground">
                    Target: <span className="font-medium text-foreground">{block.target_species}</span>
                  </p>
                )}
                {block.tackle && (
                  <p className="text-xs text-muted-foreground">
                    Tackle: <span className="font-medium text-foreground">{block.tackle}</span>
                  </p>
                )}
                <p className="text-sm text-foreground">{block.approach}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes */}
      {plan.notes && (
        <div className="flex items-start gap-2 px-1">
          <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{plan.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground active:bg-surface transition-colors"
        >
          Back
        </button>
        <button
          onClick={onRegenerate}
          className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground active:bg-surface transition-colors"
        >
          Regenerate
        </button>
        <button
          onClick={onSave}
          className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold active:scale-95 transition-all"
        >
          Save plan
        </button>
      </div>
    </div>
  );
};

export default DayPlanView;
