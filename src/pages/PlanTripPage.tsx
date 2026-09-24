import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Fish } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import PathSelector from "@/components/plan/PathSelector";
import WhenStep from "@/components/plan/steps/WhenStep";
import WhereStep from "@/components/plan/steps/WhereStep";
import LinkDataStep from "@/components/plan/steps/LinkDataStep";
import SpeciesStep from "@/components/plan/steps/SpeciesStep";
import DayPlanView from "@/components/plan/DayPlanView";
import { buildDayPlan, savePlannedTrip, type SpotLite, type DayPlan } from "@/lib/planTrip";
import { hasForecast, daysOut, type Area, type WaterKind } from "@/lib/planSuggest";

type Step = "start" | "when" | "where" | "link" | "species" | "plan";

const PlanTripPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("start");
  const [isNew, setIsNew] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [times, setTimes] = useState<string[]>([]);
  const [area, setArea] = useState<Area | null>(null);
  const [waterType, setWaterType] = useState<WaterKind | null>(null);
  const [spot, setSpot] = useState<SpotLite | null>(null);
  const [species, setSpecies] = useState<string[]>([]);
  const [tackle, setTackle] = useState<string[]>([]);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [saving, setSaving] = useState(false);

  const order: Step[] = isNew ? ["start", "when", "where", "link", "species", "plan"] : ["start", "when", "link", "species", "plan"];
  const back = () => {
    const i = order.indexOf(step);
    if (i <= 0) navigate(-1);
    else setStep(order[i - 1]);
  };

  const intake = () => {
    const d = daysOut(date);
    const notes = [
      hasForecast(date)
        ? `Trip is ${d} day(s) out — a weather forecast is available.`
        : `Trip is ${d} days out — no reliable weather forecast yet; base the plan on current / last-30-day water conditions and typical seasonal weather, and say so.`,
      species.length ? null : "Angler did not pick species: name up to 3 likely species for this water and season, each with a short reason.",
      tackle.length ? `Tackle they plan to use: ${tackle.join(", ")}` : null,
    ].filter(Boolean).join(" ");
    return {
      vessel: null,
      species,
      method: null,
      time_available: times.join(", ") || "Full day",
      travel_distance: null,
      date,
      location_query: spot?.body_of_water || null,
      notes,
    };
  };

  const generate = async () => {
    if (!spot) return;
    setStep("plan");
    setPlanLoading(true);
    setPlanError("");
    setPlan(null);
    try {
      setPlan(await buildDayPlan({ spot, date, intake: intake() }));
    } catch (e: any) {
      setPlanError(e.message || "Couldn't build the plan");
    } finally {
      setPlanLoading(false);
    }
  };

  const save = async () => {
    if (!spot || saving) return;
    setSaving(true);
    try {
      await savePlannedTrip({
        spotId: spot.id,
        date,
        planJson: (plan || { summary: "", blocks: [], best_window: "", notes: "" }) as DayPlan,
        intake: intake(),
        forecastSnapshot: null,
      });
      toast.success("Plan saved");
      navigate("/trips");
    } catch (e: any) {
      toast.error(e.message || "Couldn't save the plan");
    } finally {
      setSaving(false);
    }
  };

  const summary = step !== "start" && step !== "plan" && (
    <div className="flex flex-wrap gap-1.5 pt-3">
      <button onClick={() => setStep("when")} className="px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-foreground flex items-center gap-1">
        <Calendar className="w-3 h-3" /> {format(new Date(date + "T12:00"), "MMM d")}
        {times.length ? ` · ${times.join(", ")}` : ""}
      </button>
      {(spot || area) && (
        <button
          onClick={() => isNew ? setStep("where") : setStep("start")}
          className="px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-foreground flex items-center gap-1 max-w-[60%]"
        >
          <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{spot ? spot.name || spot.body_of_water : area?.label}</span>
        </button>
      )}
      {species.length > 0 && step !== "species" && (
        <button onClick={() => setStep("species")} className="px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-foreground flex items-center gap-1">
          <Fish className="w-3 h-3" /> {species.join(", ")}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={back} className="p-1 -ml-1 active:scale-90 transition-transform" aria-label="Back">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground flex-1">Trip Planner</h1>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-nav">
        {summary}

        {step === "start" && (
          <PathSelector
            onNewSpot={() => {
              setIsNew(true);
              setSpot(null);
              setStep("when");
            }}
            onPickSpot={(s) => {
              setIsNew(false);
              setSpot(s);
              setStep("when");
            }}
          />
        )}

        {step === "when" && (
          <WhenStep date={date} times={times} onDate={setDate} onTimes={setTimes} onNext={() => setStep(isNew && !spot ? "where" : "link")} />
        )}

        {step === "where" && (
          <WhereStep
            date={date}
            area={area}
            waterType={waterType}
            onArea={setArea}
            onWaterType={setWaterType}
            onSpotCreated={(s, sp) => {
              setSpot(s);
              if (sp.length) setSpecies(sp);
              setStep("link");
            }}
          />
        )}

        {step === "link" && spot && <LinkDataStep spot={spot} onSpotUpdated={setSpot} onNext={() => setStep("species")} />}

        {step === "species" && spot && (
          <SpeciesStep
            spot={spot}
            date={date}
            species={species}
            tackle={tackle}
            onSpecies={setSpecies}
            onTackle={setTackle}
            onBuild={generate}
          />
        )}

        {step === "plan" && spot && (
          <DayPlanView
            plan={plan}
            loading={planLoading}
            error={planError}
            spotName={spot.name || spot.body_of_water}
            date={date}
            spot={spot}
            onRegenerate={generate}
            onSave={save}
            onBack={() => setStep("species")}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default PlanTripPage;
