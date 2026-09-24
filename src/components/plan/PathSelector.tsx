import { useEffect, useState } from "react";
import { MapPin, ChevronRight, Loader2, History, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserSpots, type SpotLite } from "@/lib/planTrip";

interface Props {
  onNewSpot: () => void;
  onPickSpot: (spot: SpotLite) => void;
}

interface RankedSpot extends SpotLite {
  tripCount: number;
  distanceMi: number | null;
}

const distanceMiles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const PathSelector = ({ onNewSpot, onPickSpot }: Props) => {
  const [spots, setSpots] = useState<RankedSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 5000, maximumAge: 600000 },
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchUserSpots();
        const { data: trips } = await supabase
          .from("fishing_trips")
          .select("spot_id")
          .not("spot_id", "is", null);
        const counts: Record<string, number> = {};
        (trips || []).forEach((t: any) => {
          counts[t.spot_id] = (counts[t.spot_id] || 0) + 1;
        });
        setSpots(
          list.map((s) => ({
            ...s,
            tripCount: counts[s.id] || 0,
            distanceMi: null,
          })),
        );
      } catch {
        setSpots([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const ranked = [...spots]
    .map((s) => {
      const pt = s.spot_points?.[0];
      const distanceMi =
        here && pt ? distanceMiles(here, { lat: pt.latitude, lng: pt.longitude }) : null;
      return { ...s, distanceMi };
    })
    .sort((a, b) => {
      if (b.tripCount !== a.tripCount) return b.tripCount - a.tripCount;
      if (a.distanceMi != null && b.distanceMi != null) return a.distanceMi - b.distanceMi;
      if (a.distanceMi != null) return -1;
      if (b.distanceMi != null) return 1;
      return (a.name || a.body_of_water).localeCompare(b.name || b.body_of_water);
    });

  return (
    <div className="space-y-4">
      <div className="text-center pt-4 pb-2">
        <h2 className="text-xl font-bold text-foreground">Plan a Trip</h2>
        <p className="text-sm text-muted-foreground mt-1">Somewhere new, or water you already know</p>
      </div>

      <button
        onClick={onNewSpot}
        className="w-full text-left p-5 rounded-2xl bg-surface border border-border active:bg-surface/80 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Navigation className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Somewhere new</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tell us the area — we'll show nearby water on a map and suggest a few spots if you want help.
            </p>
          </div>
        </div>
      </button>

      <div className="pt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Your spots</p>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : ranked.length === 0 ? (
          <div className="p-4 rounded-xl bg-surface border border-border text-sm text-muted-foreground">
            No saved spots yet — start with Somewhere new above.
          </div>
        ) : (
          <div className="space-y-2">
            {ranked.map((s) => (
              <button
                key={s.id}
                onClick={() => onPickSpot(s)}
                className="w-full text-left p-4 rounded-xl bg-surface border border-border active:bg-surface/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{s.name || s.body_of_water}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <History className="w-3.5 h-3.5" />
                        {s.tripCount} {s.tripCount === 1 ? "trip" : "trips"}
                      </span>
                      {s.distanceMi != null && (
                        <span className="flex items-center gap-1">
                          <Navigation className="w-3.5 h-3.5" />
                          {s.distanceMi < 10 ? s.distanceMi.toFixed(1) : Math.round(s.distanceMi)} mi
                        </span>
                      )}
                      <span className="truncate">{s.site_type}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PathSelector;
