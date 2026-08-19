import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import PathSelector from "@/components/plan/PathSelector";
import IntakeStep from "@/components/plan/IntakeStep";
import SpotPickerStep from "@/components/plan/SpotPickerStep";
import AreaExplorerStep from "@/components/plan/AreaExplorerStep";
import DayPlanView from "@/components/plan/DayPlanView";
import {
  generateDayPlan,
  savePlannedTrip,
  fetchForecast,
  fetchWaterData,
  fetchTideData,
  fetchUserTackle,
  type PlannerIntake,
  type SpotLite,
  type DayPlan,
  type ExploreResult,
} from "@/lib/planTrip";

type Step = "path" | "intake" | "context" | "plan";

const PlanTripPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("path");
  const [mode, setMode] = useState<"explore" | "spot">("spot");
  const [intake, setIntake] = useState<PlannerIntake | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<SpotLite | null>(null);
  const [date, setDate] = useState("");
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [exploreResult, setExploreResult] = useState<ExploreResult | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [saving, setSaving] = useState(false);

  const handlePathSelect = (m: "explore" | "spot") => {
    setMode(m);
    setStep("intake");
  };

  const handleIntakeComplete = (data: PlannerIntake) => {
    setIntake(data);
    setStep("context");
  };

  const handleSpotPicked = (spot: SpotLite, d: string) => {
    setSelectedSpot(spot);
    setDate(d);
    setStep("plan");
  };

  const handleExploreComplete = (result: ExploreResult) => {
    setExploreResult(result);
    // For explore mode, we save the result directly as a planned trip
    // without a specific spot
    handleSaveExplore(result);
  };

  // Generate day plan when entering plan step
  useEffect(() => {
    if (step !== "plan" || !selectedSpot || !intake || plan) return;
    let cancelled = false;
    const run = async () => {
      setPlanLoading(true);
      setPlanError("");
      try {
        const [forecast, waterData, tideData, tackle] = await Promise.all([
          fetchForecast(selectedSpot, date),
          fetchWaterData(selectedSpot, date).catch(() => null),
          fetchTideData(selectedSpot, date).catch(() => null),
          fetchUserTackle().catch(() => []),
        ]);

        // Fetch past insights inline
        const { fetchPastInsights } = await import("@/lib/planTrip");
        const pastInsights = await fetchPastInsights(selectedSpot.id).catch(() => ({
          totalTrips: 0,
          bestHours: [],
          topSpecies: [],
          topTackle: [],
          bestConditions: null,
        }));

        const result = await generateDayPlan({
          intake,
          spot: selectedSpot,
          date,
          forecast,
          waterData,
          tideData,
          pastInsights,
          tackle,
        });

        if (!cancelled) setPlan(result);
      } catch (e: any) {
        if (!cancelled) setPlanError(e.message || "Failed to generate plan");
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [step, selectedSpot, intake, date, plan]);

  const handleSavePlan = async () => {
    if (!plan || !selectedSpot || !intake) return;
    setSaving(true);
    try {
      const tripId = await savePlannedTrip({
        spotId: selectedSpot.id,
        date,
        planJson: plan,
        intake,
        forecastSnapshot: null,
      });
      toast.success("Plan saved!");
      navigate("/trips");
    } catch (e: any) {
      toast.error(e.message || "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExplore = async (result: ExploreResult) => {
    if (!intake) return;
    setSaving(true);
    try {
      await savePlannedTrip({
        spotId: null,
        date: intake.date || new Date().toISOString().split("T")[0],
        planJson: result,
        intake,
        forecastSnapshot: null,
      });
      toast.success("Plan saved!");
      navigate("/trips");
    } catch (e: any) {
      toast.error(e.message || "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = () => {
    setPlan(null);
    // re-trigger useEffect by toggling step
    setStep("plan");
  };

  const handleBack = () => {
    if (step === "intake") setStep("path");
    else if (step === "context") setStep("intake");
    else if (step === "plan") setStep("context");
    else navigate(-1);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          {step !== "path" && (
            <button onClick={handleBack} className="p-1 -ml-1 active:scale-90 transition-transform">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className="text-base font-semibold text-foreground flex-1">AI Trip Planner</h1>
          {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-nav">
        {step === "path" && <PathSelector onSelect={handlePathSelect} />}
        {step === "intake" && intake === null && (
          <IntakeStep mode={mode} onComplete={handleIntakeComplete} onBack={handleBack} />
        )}
        {step === "intake" && intake !== null && (
          <IntakeStep mode={mode} onComplete={handleIntakeComplete} onBack={handleBack} />
        )}
        {step === "context" && mode === "spot" && intake && (
          <SpotPickerStep intake={intake} onBack={handleBack} onComplete={handleSpotPicked} />
        )}
        {step === "context" && mode === "explore" && intake && (
          <AreaExplorerStep intake={intake} onBack={handleBack} onComplete={handleExploreComplete} />
        )}
        {step === "plan" && selectedSpot && (
          <DayPlanView
            plan={plan}
            loading={planLoading}
            error={planError}
            spotName={selectedSpot.name || selectedSpot.body_of_water}
            date={date}
            onRegenerate={handleRegenerate}
            onSave={handleSavePlan}
            onBack={handleBack}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default PlanTripPage;
