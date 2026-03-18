import { Fish, MapPin, Clock } from "lucide-react";

interface CatchEntry {
  id: string;
  species: string;
  weight: string;
  location: string;
  time: string;
}

const sampleCatches: CatchEntry[] = [
  { id: "1", species: "Largemouth Bass", weight: "4.2 lbs", location: "Lake Fork, TX", time: "2h ago" },
  { id: "2", species: "Rainbow Trout", weight: "2.8 lbs", location: "White River, AR", time: "Yesterday" },
  { id: "3", species: "Crappie", weight: "1.1 lbs", location: "Table Rock Lake", time: "3 days ago" },
];

const RecentCatchCard = ({ entry }: { entry: CatchEntry }) => {
  return (
    <div className="catch-card flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer">
      <div className="h-12 w-12 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
        <Fish className="w-6 h-6 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium tracking-tight text-card-foreground truncate">{entry.species}</p>
          <span className="catch-data text-sm font-semibold text-card-foreground">{entry.weight}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            {entry.location}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {entry.time}
          </span>
        </div>
      </div>
    </div>
  );
};

const RecentCatches = () => {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight text-foreground px-1">Recent Catches</h2>
      <div className="space-y-2">
        {sampleCatches.map((entry) => (
          <RecentCatchCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
};

export default RecentCatches;
