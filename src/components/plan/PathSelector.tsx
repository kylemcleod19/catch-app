import { MessageSquare, LayoutList, Mic, MapPin } from "lucide-react";

interface Props {
  onSelect: (mode: "chat" | "guided") => void;
}

const PathSelector = ({ onSelect }: Props) => {
  return (
    <div className="space-y-4">
      <div className="text-center pt-4 pb-2">
        <h2 className="text-xl font-bold text-foreground">Plan a Trip</h2>
        <p className="text-sm text-muted-foreground mt-1">Two ways to get there</p>
      </div>

      <button
        onClick={() => onSelect("chat")}
        className="w-full text-left p-5 rounded-2xl bg-surface border border-border active:bg-surface/80 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MessageSquare className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Talk it through</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              A back-and-forth with the AI. It asks what it needs — salt or fresh, which water, what you're after, what
              you're throwing — then builds the plan.
            </p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Mic className="w-3.5 h-3.5" /> Voice or typing, any time
            </p>
          </div>
        </div>
      </button>

      <button
        onClick={() => onSelect("guided")}
        className="w-full text-left p-5 rounded-2xl bg-surface border border-border active:bg-surface/80 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <LayoutList className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Pick from what I know</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose your spot, species, tackle and date from lists. Fast and no typing — jump to the AI whenever you
              want.
            </p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Uses your saved spots and tackle box
            </p>
          </div>
        </div>
      </button>
    </div>
  );
};

export default PathSelector;
