import { AlertCircle, Clock, Fish, Sparkles } from "lucide-react";
import type { DayBlock, DayPlan } from "@/lib/planTrip";

interface Props {
  plan: unknown;
}

const isDayBlock = (value: unknown): value is DayBlock => {
  if (!value || typeof value !== "object") return false;
  const block = value as Record<string, unknown>;
  return typeof block.window === "string" && typeof block.approach === "string";
};

const parsePlan = (value: unknown): DayPlan | null => {
  if (!value || typeof value !== "object") return null;
  const plan = value as Record<string, unknown>;
  const blocks = Array.isArray(plan.blocks) ? plan.blocks.filter(isDayBlock) : [];

  if (!blocks.length && typeof plan.summary !== "string") return null;

  return {
    summary: typeof plan.summary === "string" ? plan.summary : "",
    best_window: typeof plan.best_window === "string" ? plan.best_window : "",
    notes: typeof plan.notes === "string" ? plan.notes : "",
    blocks,
  };
};

const FAVORABILITY: Record<string, string> = {
  prime: "bg-primary text-primary-foreground",
  good: "bg-primary/15 text-primary",
  fair: "bg-muted text-muted-foreground",
  poor: "bg-muted/60 text-muted-foreground",
};

const SavedPlanDetails = ({ plan: rawPlan }: Props) => {
  const plan = parsePlan(rawPlan);

  return (
    <section className="space-y-3 border-t border-border pt-5" aria-labelledby="saved-plan-title">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 id="saved-plan-title" className="text-sm font-semibold text-foreground">Saved plan</h3>
      </div>

      {!plan ? (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
          This trip was saved without a detailed plan.
        </p>
      ) : (
        <>
          {plan.summary && <p className="text-sm text-foreground">{plan.summary}</p>}

          {plan.best_window && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">Best window:</span>
              <span className="font-semibold text-foreground">{plan.best_window}</span>
            </div>
          )}

          {plan.blocks.length > 0 && (
            <div className="space-y-2">
              {plan.blocks.map((block, index) => (
                <article key={`${block.window}-${index}`} className="overflow-hidden rounded-lg border border-border bg-surface">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <span className="text-sm font-semibold text-foreground">{block.window}</span>
                    {block.favorability && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${FAVORABILITY[block.favorability] || FAVORABILITY.fair}`}>
                        {block.favorability}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    {block.conditions && <p className="text-sm text-muted-foreground">{block.conditions}</p>}
                    {block.target_species && (
                      <p className="flex items-start gap-2 text-sm text-foreground">
                        <Fish className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span><span className="font-medium">Target:</span> {block.target_species}</span>
                      </p>
                    )}
                    {block.tackle && <p className="text-sm text-foreground"><span className="font-medium">Tackle:</span> {block.tackle}</p>}
                    {block.approach && <p className="text-sm text-foreground">{block.approach}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}

          {plan.notes && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{plan.notes}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default SavedPlanDetails;