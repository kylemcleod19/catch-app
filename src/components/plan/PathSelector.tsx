import { Compass, MapPin } from "lucide-react";

interface Props {
  onSelect: (mode: "explore" | "spot") => void;
}

const PathSelector = ({ onSelect }: Props) => {
  return (
    <div className="space-y-4">
      <div className="text-center pt-4 pb-2">
        <h2 className="text-xl font-bold text-foreground">Plan a Trip</h2>
        <p className="text-sm text-muted-foreground mt-1">AI-guided planning, voice-first</p>
      </div>

      <button
        onClick={() => onSelect("explore")}
        className="w-full text-left p-5 rounded-2xl bg-surface border border-border active:bg-surface/80 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Compass className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Explore a new area</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              "I'm going to Corpus Christi on July 20th." Find a spot and plan the day.
            </p>
          </div>
        </div>
      </button>

      <button
        onClick={() => onSelect("spot")}
        className="w-full text-left p-5 rounded-2xl bg-surface border border-border active:bg-surface/80 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Plan at my spot</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pick a spot you already fish. Get an hour-by-hour guide based on conditions and past trips.
            </p>
          </div>
        </div>
      </button>
    </div>
  );
};

export default PathSelector;
