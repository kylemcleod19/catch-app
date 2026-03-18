import { Plus, CalendarPlus, MapPin, Fish, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import WeatherHeader from "@/components/WeatherHeader";
import { useNavigate } from "react-router-dom";

const RecentTripCard = ({ title, location, date, catchCount }: { title: string; location: string; date: string; catchCount: number }) => (
  <div className="catch-card flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer">
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
  </div>
);

const sampleTrips = [
  { id: "1", title: "Morning on Lake Fork", location: "Lake Fork, TX", date: "Mar 15", catchCount: 4 },
  { id: "2", title: "White River Float", location: "White River, AR", date: "Mar 12", catchCount: 7 },
  { id: "3", title: "Table Rock Evening", location: "Table Rock Lake, MO", date: "Mar 8", catchCount: 2 },
];

const Index = () => {
  const navigate = useNavigate();

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
        <WeatherHeader />

        {/* Primary Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="catch" size="lg" className="w-full gap-2" onClick={() => navigate("/trips")}>
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
            {sampleTrips.map((trip) => (
              <RecentTripCard key={trip.id} {...trip} />
            ))}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Index;
