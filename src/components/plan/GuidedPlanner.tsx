import { useEffect, useState } from "react";
import { MapPin, Calendar, ChevronRight, Loader2, Fish, Clock, Trophy, Box, MessageSquare, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import DayPlanView from "./DayPlanView";
import {
  fetchUserSpots,
  fetchPastInsights,
  fetchUserTackle,
  buildDayPlan,
  savePlannedTrip,
  updatePlannedTrip,
  type SpotLite,
  type PastInsights,
  type DayPlan,
  type ChatDetails,
} from "@/lib/planTrip";
import { fetchSpecies, speciesFitsWater } from "@/lib/species";

interface Props {
  initialSpot?: SpotLite | null;
  onSwitchToChat: (seed: ChatDetails) => void;
  onSaved: () => void;
  initialTripId?: string | null;
  initialDetails?: ChatDetails | null;
}

type Step = "spot" | "details" | "plan";

const TIME_OPTIONS = ["Dawn patrol", "Morning", "Midday", "Afternoon", "Evening", "Full day"];

const GuidedPlanner = ({ initialSpot, onSwitchToChat, onSaved, initialTripId, initialDetails }: Props) => {
  const [step, setStep] = useState<Step>(initialSpot ? "details" : "spot");
  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState<SpotLite[]>([]);
  const [spot, setSpot] = useState<SpotLite | null>(initialSpot ?? null);
  const [insights, setInsights] = useState<PastInsights | null>(null);

  const [speciesList, setSpeciesList] = useState<string[]>([]);
  const [tackleList, setTackleList] = useState<{ name: string; category: string | null; species: string[] }[]>([]);
  const [pickedSpecies, setPickedSpecies] = useState<string[]>(initialDetails?.species || []);
  const [pickedTackle, setPickedTackle] = useState<string[]>(initialDetails?.tackle || []);
  const [date, setDate] = useState(initialDetails?.date || format(new Date(), "yyyy-MM-dd"));
  const [timeAvailable, setTimeAvailable] = useState<string>(initialDetails?.time_available || "Morning");

  const [showAllSpecies, setShowAllSpecies] = useState(false);

  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");

  useEffect(() => {
    Promise.all([
      fetchUserSpots().then(setSpots).catch(() => toast.error("Failed to load spots")),
      fetchSpecies().then((s) => setSpeciesList(s.map((x) => x.primary_name))).catch(() => {}),
      fetchUserTackle().then(setTackleList).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!spot) return;
    setInsights(null);
    fetchPastInsights(spot.id).then(setInsights).catch(() => {});
  }, [spot]);

  const seed = (): ChatDetails => ({
    location: spot?.body_of_water,
    body_of_water: spot?.body_of_water,
    species: pickedSpecies,
    tackle: pickedTackle,
    date,
    time_available: timeAvailable,
  });

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const generate = async () => {
    if (!spot) return;
    setStep("plan");
    setPlanLoading(true);
    setPlanError("");
    setPlan(null);
    try {
      const result = await buildDayPlan({
        spot,
        date,
        intake: {
          vessel: null,
          species: pickedSpecies,
          method: null,
          time_available: timeAvailable,
          travel_distance: null,
          date,
          location_query: spot.body_of_water,
          notes: pickedTackle.length ? `Tackle they plan to use: ${pickedTackle.join(", ")}` : null,
        },
      });
      setPlan(result);
    } catch (e: any) {
      setPlanError(e.message || "Failed to build the plan");
    } finally {
      setPlanLoading(false);
    }
  };

  const save = async () => {
    if (!plan || !spot) return;
    try {
      const saveParams = {
        spotId: spot.id,
        date,
        planJson: plan,
        intake: {
          vessel: null,
          species: pickedSpecies,
          method: null,
          time_available: timeAvailable,
          travel_distance: null,
          date,
          location_query: spot.body_of_water,
          notes: null,
        },
        forecastSnapshot: null,
      };
      if (initialTripId) {
        await updatePlannedTrip({ tripId: initialTripId, date, planJson: plan, forecastSnapshot: null });
      } else {
        await savePlannedTrip(saveParams);
      }
      toast.success("Plan saved!");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to save plan");
    }
  };

  const askAi = (
    <button
      onClick={() => onSwitchToChat(seed())}
      className="w-full py-2.5 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground flex items-center justify-center gap-1.5"
    >
      <MessageSquare className="w-3.5 h-3.5" />
      Not sure? Talk it through with the AI
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (step === "plan" && spot) {
    return (
      <DayPlanView
        plan={plan}
        loading={planLoading}
        error={planError}
        spotName={spot.name || spot.body_of_water}
        date={date}
        onRegenerate={generate}
        onSave={save}
        onBack={() => setStep("details")}
      />
    );
  }

  if (step === "spot") {
    return (
      <div className="space-y-4">
        <div className="pt-4">
          <h2 className="text-xl font-bold text-foreground">Pick a spot</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose from the waters you already fish</p>
        </div>

        {spots.length === 0 && (
          <div className="p-4 rounded-xl bg-surface border border-border text-sm text-muted-foreground">
            You haven't saved any spots yet — talk it through with the AI to find water instead.
          </div>
        )}

        <div className="space-y-2">
          {spots.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSpot(s); setStep("details"); }}
              className="w-full text-left p-4 rounded-xl bg-surface border border-border active:bg-surface/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{s.name || s.body_of_water}</p>
                  <p className="text-xs text-muted-foreground">{s.body_of_water} · {s.site_type}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))}
        </div>

        {askAi}
      </div>
    );
  }

  // details step
  const isSaltwater = spot?.is_tidal || spot?.site_type === "Tidal";
  const allSpecies = Array.from(new Set([...(insights?.topSpecies || []), ...speciesList]));
  // Species actually caught here always stay, regardless of classification.
  const localSpecies = allSpecies.filter(
    (s) =>
      pickedSpecies.includes(s) ||
      (insights?.topSpecies || []).includes(s) ||
      speciesFitsWater(s, isSaltwater)
  );
  const suggestedSpecies = (showAllSpecies ? allSpecies : localSpecies).slice(0, 24);
  const hiddenCount = allSpecies.length - localSpecies.length;

  return (
    <div className="space-y-4">
      <div className="pt-4">
        {!initialSpot && (
          <button onClick={() => setStep("spot")} className="text-sm text-muted-foreground active:text-foreground mb-2">
            ← Back to spots
          </button>
        )}
        <h2 className="text-xl font-bold text-foreground">{spot?.name || spot?.body_of_water}</h2>
        <p className="text-sm text-muted-foreground">{spot?.body_of_water} · {spot?.site_type}</p>
      </div>

      {/* Date */}
      <div className="p-4 rounded-xl bg-surface border border-border">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
          <Calendar className="w-3.5 h-3.5" />
          Trip date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-transparent text-foreground text-lg font-semibold outline-none"
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* Time window */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          How much of the day
        </p>
        <div className="flex flex-wrap gap-2">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setTimeAvailable(t)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                timeAvailable === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Species */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Fish className="w-3.5 h-3.5" />
          Target species
          {insights?.topSpecies?.length ? (
            <span className="normal-case"> · your top here: {insights.topSpecies.slice(0, 3).join(", ")}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestedSpecies.map((s) => (
            <button
              key={s}
              onClick={() => toggle(pickedSpecies, setPickedSpecies, s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1 ${
                pickedSpecies.includes(s)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border"
              }`}
            >
              {pickedSpecies.includes(s) && <Check className="w-3.5 h-3.5" />}
              {s}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Showing {isSaltwater ? "saltwater" : "freshwater"} species for this water.
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAllSpecies(!showAllSpecies)}
              className="ml-1 underline font-medium text-foreground"
            >
              {showAllSpecies ? "Show local only" : `Show all (${hiddenCount} more)`}
            </button>
          )}
        </p>
      </div>


      {/* Tackle */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Box className="w-3.5 h-3.5" />
          Tackle you're bringing
        </p>
        {tackleList.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your tackle box is empty — the AI will suggest general options.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tackleList.slice(0, 30).map((t) => (
              <button
                key={t.name}
                onClick={() => toggle(pickedTackle, setPickedTackle, t.name)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1 ${
                  pickedTackle.includes(t.name)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border"
                }`}
              >
                {pickedTackle.includes(t.name) && <Check className="w-3.5 h-3.5" />}
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Past insights */}
      {insights && insights.totalTrips > 0 && (
        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Trophy className="w-4 h-4 text-primary" />
            Past insights ({insights.totalTrips} trips)
          </div>
          {insights.bestHours.length > 0 && (
            <p className="text-sm text-muted-foreground">Best hours: <span className="font-medium text-foreground">{insights.bestHours.join(", ")}</span></p>
          )}
          {insights.topTackle.length > 0 && (
            <p className="text-sm text-muted-foreground">Top tackle: <span className="font-medium text-foreground">{insights.topTackle.join(", ")}</span></p>
          )}
        </div>
      )}


      {/* Water data station */}
      {spot && (
        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            {isTidalSpot ? <Waves className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
            {isTidalSpot ? "Tide station" : "Water flow station"}
          </p>
          <p className="text-sm text-foreground">
            {isTidalSpot
              ? spot.noaa_tide_station_id
                ? `${spot.noaa_station_name || "NOAA station"} (${spot.noaa_tide_station_id})`
                : "No tide station linked yet"
              : spot.usgs_site_id
                ? `USGS ${spot.usgs_site_id}`
                : "No monitoring station linked yet"}
          </p>
          <button
            onClick={() => (isTidalSpot ? setTideModal(true) : setUsgsModal(true))}
            className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-foreground active:bg-background transition-colors"
          >
            {(isTidalSpot ? spot.noaa_tide_station_id : spot.usgs_site_id) ? "Change station" : "Pick a station"}
          </button>
        </div>
      )}

      <button
        onClick={generate}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5"
      >
        Generate plan
        <ChevronRight className="w-4 h-4" />
      </button>

      {askAi}

      {spot && !isTidalSpot && (
        <StationLinkModal
          open={usgsModal}
          onOpenChange={setUsgsModal}
          spot={spot}
          onLinked={reloadSpot}
        />
      )}
      {spot && isTidalSpot && (
        <TideStationLinkModal
          open={tideModal}
          onOpenChange={setTideModal}
          spot={spot}
          onLinked={reloadSpot}
        />
      )}
    </div>
  );

};

export default GuidedPlanner;
