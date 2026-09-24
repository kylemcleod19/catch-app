import { Check, Sparkles } from "lucide-react";

export interface SuggestionItem {
  id: string;
  title: string;
  why: string;
  meta?: string;
}

interface Props {
  items: SuggestionItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  numbered?: boolean;
}

/** AI suggestion cards — max 3, each with a reason. */
const SuggestionList = ({ items, selectedIds, onToggle, numbered }: Props) => (
  <div className="space-y-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
      <Sparkles className="w-3 h-3 text-primary" /> AI suggestions
    </p>
    {items.slice(0, 3).map((it, i) => {
      const sel = selectedIds.includes(it.id);
      return (
        <button
          key={it.id}
          type="button"
          onClick={() => onToggle(it.id)}
          className={`w-full text-left p-3 rounded-xl border transition-colors ${
            sel ? "bg-primary/10 border-primary" : "bg-surface border-border active:bg-surface/80"
          }`}
        >
          <div className="flex items-center gap-2">
            {numbered && (
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
            )}
            <p className="font-semibold text-foreground flex-1 text-sm">{it.title}</p>
            {sel && <Check className="w-4 h-4 text-primary shrink-0" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{it.why}</p>
          {it.meta && <p className="text-xs text-muted-foreground mt-1">{it.meta}</p>}
        </button>
      );
    })}
  </div>
);

export default SuggestionList;
