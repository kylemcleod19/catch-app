import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, LayoutList } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import VoiceTextComposer from "./VoiceTextComposer";
import DayPlanView from "./DayPlanView";
import CandidateSpotsMap from "./CandidateSpotsMap";
import {
  planChat,
  fetchUserSpots,
  fetchUserTackle,
  buildDayPlan,
  detailsToIntake,
  savePlannedTrip,
  createCandidatePlannedTrip,
  type ChatMessage,
  type ChatDetails,
  type SpotLite,
  type DayPlan,
  type ExploreResult,
} from "@/lib/planTrip";
import { fetchSpecies } from "@/lib/species";

interface Props {
  seedDetails?: ChatDetails | null;
  onSwitchToGuided: () => void;
  onSaved: () => void;
  onCandidateCreated: (spot: SpotLite, tripId: string, details: ChatDetails) => void;
}

const OPENING =
  "Where and when are you thinking of fishing? A city or water body and a rough date is enough to start.";

const PlannerChat = ({ seedDetails, onSwitchToGuided, onSaved, onCandidateCreated }: Props) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: OPENING }]);
  const [details, setDetails] = useState<ChatDetails | null>(seedDetails || null);
  const [candidates, setCandidates] = useState<ExploreResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [spots, setSpots] = useState<SpotLite[]>([]);
  const [species, setSpecies] = useState<string[]>([]);
  const [tackle, setTackle] = useState<{ name: string; category: string | null; species: string[] }[]>([]);

  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [planSpot, setPlanSpot] = useState<SpotLite | null>(null);
  const [planDate, setPlanDate] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUserSpots().then(setSpots).catch(() => {});
    fetchUserTackle().then(setTackle).catch(() => {});
    fetchSpecies().then((s) => setSpecies(s.map((x) => x.primary_name))).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, candidates]);

  const runPlan = async (spot: SpotLite, date: string, nextDetails: ChatDetails | null) => {
    setPlanSpot(spot);
    setPlanDate(date);
    setPlanLoading(true);
    setPlanError("");
    try {
      const result = await buildDayPlan({ spot, date, intake: detailsToIntake(nextDetails) });
      setPlan(result);
    } catch (e: any) {
      setPlanError(e.message || "Failed to build the plan");
    } finally {
      setPlanLoading(false);
    }
  };

  const send = async (text: string) => {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const turn = await planChat({
        messages: next,
        context: {
          today: format(new Date(), "yyyy-MM-dd"),
          spots: spots.map((s) => ({
            id: s.id,
            name: s.name,
            body_of_water: s.body_of_water,
            state_code: s.state_code,
            site_type: s.site_type,
          })),
          species,
          tackle,
          details,
        },
      });

      const merged = turn.details ? { ...(details || {}), ...turn.details } : details;
      if (turn.details) setDetails(merged);
      if (turn.spots) setCandidates(turn.spots);
      setMessages((m) => [...m, { role: "assistant", content: turn.reply }]);

      if (turn.planRequest) {
        const spot = spots.find((s) => s.id === turn.planRequest!.spot_id);
        if (spot) await runPlan(spot, turn.planRequest.date, merged);
      }
    } catch (e: any) {
      toast.error(e.message || "The planner had trouble responding");
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    if (!plan || !planSpot) return;
    try {
      await savePlannedTrip({
        spotId: planSpot.id,
        date: planDate,
        planJson: plan,
        intake: detailsToIntake(details),
        forecastSnapshot: null,
      });
      toast.success("Plan saved!");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  };

  const pickCandidate = async (candidate: import("@/lib/planTrip").CandidateSpot) => {
    if (savingCandidate) return;
    setSavingCandidate(true);
    try {
      const nextDetails: ChatDetails = {
        ...(details || {}),
        body_of_water: candidate.name,
        species: details?.species?.length ? details.species : candidate.species,
      };
      const date = nextDetails.date || format(new Date(), "yyyy-MM-dd");
      const created = await createCandidatePlannedTrip({ candidate, date, details: nextDetails });
      toast.success("Spot and planned trip created");
      onCandidateCreated(created.spot, created.tripId, { ...nextDetails, date });
    } catch (e: any) {
      toast.error(e.message || "Failed to create the spot and trip");
    } finally {
      setSavingCandidate(false);
    }
  };

  // Grounded day plan takes over the screen once requested
  if (planSpot && (plan || planLoading || planError)) {
    return (
      <DayPlanView
        plan={plan}
        loading={planLoading}
        error={planError}
        spotName={planSpot.name || planSpot.body_of_water}
        date={planDate}
        onRegenerate={() => runPlan(planSpot, planDate, details)}
        onSave={savePlan}
        onBack={() => { setPlan(null); setPlanSpot(null); setPlanError(""); }}
      />
    );
  }

  const chips = [
    details?.location && `📍 ${details.location}`,
    details?.body_of_water,
    details?.water_type && details.water_type !== "unknown" && details.water_type,
    details?.date,
    details?.species?.length && details.species.join(", "),
    details?.vessel && details.vessel !== "unknown" && details.vessel,
    details?.method && details.method !== "unknown" && details.method,
    details?.time_available,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)]">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-3">
          {chips.map((c, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium capitalize">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 py-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex gap-2"}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
            )}
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3.5 py-2 text-sm"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-surface border border-border px-3.5 py-2 text-sm text-foreground"
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {candidates?.spots?.length ? (
          <CandidateSpotsMap
            spots={candidates.spots}
            regionHint={details?.location || null}
            onPick={pickCandidate}
            onNoneOfThese={() => {
              setCandidates(null);
              setMessages((m) => [
                ...m,
                { role: "assistant", content: "No problem — what didn't work about those? Too far, wrong species, wrong kind of water?" },
              ]);
            }}
          />
        ) : null}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 bg-background pt-2 pb-3 space-y-2">
        <VoiceTextComposer onSend={send} disabled={busy || savingCandidate} placeholder={savingCandidate ? "Creating spot and trip…" : "Say or type your answer…"} />
        <button
          onClick={onSwitchToGuided}
          className="w-full py-2 text-xs font-medium text-muted-foreground flex items-center justify-center gap-1.5"
        >
          <LayoutList className="w-3.5 h-3.5" />
          Switch to guided picker
        </button>
      </div>
    </div>
  );
};

export default PlannerChat;
