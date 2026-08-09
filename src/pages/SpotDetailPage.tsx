import { SPOT_TYPE_SELECT, flattenSpot } from "@/lib/spotData";
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ChevronLeft, Loader2, MapPin, Fish, Play, Droplets, CloudSun,
  Pencil, Trash2, Calendar, Layers, Link2, Anchor,
} from "lucide-react";

import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/lib/googleMaps";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import SpotWaterConditions from "@/components/spots/SpotWaterConditions";
import SpotWeatherForecast from "@/components/spots/SpotWeatherForecast";
import SpotEditModal from "@/components/spots/SpotEditModal";
import StationLinkModal from "@/components/spots/StationLinkModal";
import TideStationLinkModal from "@/components/spots/TideStationLinkModal";
import { getStateName } from "@/lib/us-states";
import { toast } from "sonner";

const DRAFT_KEY = "draftTripId";

const PIN_COLORS = [
  "#E53E3E", "#3182CE", "#38A169", "#D69E2E", "#9F7AEA",
  "#ED64A6", "#DD6B20", "#319795", "#5A67D8", "#B83280",
];
const getPinColor = (i: number) => PIN_COLORS[i % PIN_COLORS.length];

const pinSvgIcon = (color: string, label: string) =>
  "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="${color}"/>
      <text x="16" y="20" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial">${label}</text>
    </svg>`
  );

interface SpotRow {
  id: string;
  name: string | null;
  body_of_water: string;
  state_code: string;
  site_type: string;
  usgs_site_id: string | null;
  noaa_tide_station_id: string | null;
  noaa_station_name: string | null;
  noaa_station_distance_miles: number | null;
  spot_points: { id: string; label: string; latitude: number; longitude: number }[];
}

interface TripRow {
  id: string;
  started_at: string;
  catchCount: number;
  topSpecies: string[];
}

const SpotMap = ({
  apiKey, points, satellite,
}: {
  apiKey: string;
  points: SpotRow["spot_points"];
  satellite: boolean;
}) => {
  const { isLoaded } = useGoogleMaps(apiKey);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) mapRef.current.setMapTypeId(satellite ? "satellite" : "roadmap");
  }, [satellite]);

  if (!isLoaded) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const center = points[0]
    ? { lat: points[0].latitude, lng: points[0].longitude }
    : { lat: 32.87, lng: -97.34 };

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      onLoad={(map) => {
        mapRef.current = map;
        map.setMapTypeId(satellite ? "satellite" : "roadmap");
        map.setOptions({
          gestureHandling: "greedy",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        if (points.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          points.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
          map.fitBounds(bounds, 60);
          if (points.length === 1) map.setZoom(15);
        } else {
          map.setCenter(center);
          map.setZoom(6);
        }
      }}
      onUnmount={() => { mapRef.current = null; }}
    >
      {points.map((p, i) => (
        <Marker
          key={p.id}
          position={{ lat: p.latitude, lng: p.longitude }}
          title={p.label}
          icon={{
            url: pinSvgIcon(getPinColor(i), String(i + 1)),
            scaledSize: new google.maps.Size(32, 40),
            anchor: new google.maps.Point(16, 40),
          }}
        />
      ))}
    </GoogleMap>
  );
};

const SpotDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [spot, setSpot] = useState<SpotRow | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [stationOpen, setStationOpen] = useState(false);
  const [tideOpen, setTideOpen] = useState(false);
  const [starting, setStarting] = useState(false);


  const fetchAll = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    const { data: s } = await supabase
      .from("spots")
      .select(`id, name, body_of_water, state_code, site_type, spot_points(id, label, latitude, longitude), ${SPOT_TYPE_SELECT}`)
      .eq("id", id)
      .maybeSingle() as any;


    const { data: t } = await supabase
      .from("fishing_trips")
      .select("id, started_at")
      .eq("user_id", user.id)
      .eq("spot_id", id)
      .eq("status", "completed")
      .order("started_at", { ascending: false });

    const tripIds = (t || []).map((x) => x.id);
    const speciesMap: Record<string, Record<string, number>> = {};
    const countMap: Record<string, number> = {};
    if (tripIds.length) {
      const { data: catches } = await supabase
        .from("catches")
        .select("trip_id, species, quantity")
        .in("trip_id", tripIds);
      catches?.forEach((c: any) => {
        countMap[c.trip_id] = (countMap[c.trip_id] || 0) + c.quantity;
        if (!speciesMap[c.trip_id]) speciesMap[c.trip_id] = {};
        speciesMap[c.trip_id][c.species] = (speciesMap[c.trip_id][c.species] || 0) + c.quantity;
      });
    }

    setSpot(s ? (flattenSpot(s) as any) : null);
    setTrips(
      (t || []).map((tr) => ({
        id: tr.id,
        started_at: tr.started_at,
        catchCount: countMap[tr.id] || 0,
        topSpecies: Object.entries(speciesMap[tr.id] || {})
          .sort(([, a], [, b]) => b - a)
          .slice(0, 2)
          .map(([n]) => n),
      }))
    );
    setLoading(false);
  }, [id, user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  const handleStartTrip = async () => {
    if (!user || !spot) return;
    if (localStorage.getItem(DRAFT_KEY)) {
      toast.error("You already have a trip in progress.");
      navigate("/");
      return;
    }
    setStarting(true);
    const { data, error } = await supabase
      .from("fishing_trips")
      .insert({
        user_id: user.id,
        title: `Trip to ${spot.name || spot.body_of_water}`,
        status: "draft",
        spot_id: spot.id,
      } as any)
      .select("id")
      .single();
    setStarting(false);
    if (error || !data) { toast.error("Failed to start trip"); return; }
    localStorage.setItem(DRAFT_KEY, data.id);
    navigate("/");
  };

  const handleDelete = async () => {
    if (!spot) return;
    if (!confirm("Delete this spot?")) return;
    const { error } = await supabase.from("spots").delete().eq("id", spot.id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Spot deleted");
    navigate("/spots");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!spot) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-4">
        <p className="text-muted-foreground text-sm">Spot not found</p>
        <Button onClick={() => navigate("/spots")} variant="outline" size="sm">Back to spots</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <button onClick={() => navigate("/spots")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight text-foreground truncate">
              {spot.name || spot.body_of_water}
            </h1>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {spot.body_of_water} · {getStateName(spot.state_code)}
            </p>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted"
            aria-label="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Map */}
        <div className="relative w-full h-64 rounded-xl overflow-hidden border border-border/50 bg-muted">
          {apiKey ? (
            <SpotMap apiKey={apiKey} points={spot.spot_points} satellite={satellite} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
              Map unavailable
            </div>
          )}
          <button
            onClick={() => setSatellite((v) => !v)}
            className="absolute top-2 right-2 bg-background/90 backdrop-blur rounded-lg p-2 shadow-sm border border-border/50"
            aria-label="Toggle satellite"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>

        {/* Pins legend */}
        {spot.spot_points.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {spot.spot_points.map((p, i) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white"
                style={{ backgroundColor: getPinColor(i) }}
              >
                <MapPin className="w-3 h-3" /> {p.label}
              </span>
            ))}
          </div>
        )}

        {/* Primary action */}
        <Button
          variant="catch"
          className="w-full h-11 rounded-xl gap-2"
          disabled={starting}
          onClick={handleStartTrip}
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Start Trip
        </Button>

        {/* Active conditions — driven by the spot's water type */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isTidal ? <Anchor className="w-3.5 h-3.5" /> : <Droplets className="w-3.5 h-3.5" />}
              {isTidal ? "Tide" : spot.site_type === "Lake" ? "Lake level" : "Water"}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-lg text-xs gap-1 text-primary"
              onClick={() => (isTidal ? setTideOpen(true) : setStationOpen(true))}
            >
              <Link2 className="w-3.5 h-3.5" />
              {linkedStation ? "Change station" : "Link station"}
            </Button>
          </div>

          {linkedStation && (
            <p className="text-xs text-muted-foreground truncate">{linkedStation}</p>
          )}

          {isTidal ? (
            !spot.noaa_tide_station_id ? (
              <p className="text-xs text-muted-foreground italic">No NOAA tide station linked.</p>
            ) : null
          ) : spot.usgs_site_id ? (
            <SpotWaterConditions usgsSiteId={spot.usgs_site_id} />
          ) : (
            <p className="text-xs text-muted-foreground italic">No USGS station linked.</p>
          )}
        </section>



        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CloudSun className="w-3.5 h-3.5" /> Forecast
          </div>
          {spot.spot_points.length > 0 ? (
            <SpotWeatherForecast
              lat={spot.spot_points[0].latitude}
              lon={spot.spot_points[0].longitude}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">Add a pin to see forecast.</p>
          )}
        </section>

        {/* Trips */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Fish className="w-3.5 h-3.5" /> Trips
            </div>
            <span className="text-xs text-muted-foreground">{trips.length}</span>
          </div>
          {trips.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No trips logged here yet.</p>
          ) : (
            <div className="space-y-2">
              {trips.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate("/trips")}
                  className="w-full catch-card flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Fish className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      {format(new Date(t.started_at), "MMM d, yyyy")}
                    </p>
                    {t.topSpecies.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {t.topSpecies.join(" & ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Fish className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold text-card-foreground">{t.catchCount}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      {tideOpen && (
        <TideStationLinkModal
          open={tideOpen}
          onOpenChange={(o) => { if (!o) setTideOpen(false); }}
          spot={spot}
          onLinked={fetchAll}
        />
      )}
      {editOpen && (
        <SpotEditModal
          open={editOpen}
          onOpenChange={(o) => { if (!o) setEditOpen(false); }}
          spot={spot}
          onUpdated={fetchAll}
        />
      )}
      {stationOpen && (
        <StationLinkModal
          open={stationOpen}
          onOpenChange={(o) => { if (!o) setStationOpen(false); }}
          spot={spot}
          onLinked={fetchAll}
        />
      )}

      <BottomNav />
    </div>
  );
};

export default SpotDetailPage;
