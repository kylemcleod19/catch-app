import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, LayoutList, Map as MapIcon, Fish, ChevronRight, Mic, Square, Calendar, Clock, MapPin, Volume2, VolumeX } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import VoiceTextComposer from "./VoiceTextComposer";
import CandidateSpotsMap from "./CandidateSpotsMap";
import ChoiceChips from "./ChoiceChips";
import SpotCreationModal from "@/components/spots/SpotCreationModal";
import {
  planChat,
  fetchUserSpots,
  fetchUserTackle,
  createCandidatePlannedTrip,
  type ChatMessage,
  type ChatDetails,
  type SpotLite,
  type ExploreResult,
  type CandidateSpot,
} from "@/lib/planTrip";
import { fetchSpecies, speciesFitsWater } from "@/lib/species";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { speak, stopSpeaking } from "@/lib/speak";

interface Props {
  seedDetails?: ChatDetails | null;
  onSwitchToGuided: () => void;
  onSaved: () => void;
  onCandidateCreated: (spot: SpotLite, tripId: string, details: ChatDetails) => void;
  onSpotReady: (spot: SpotLite, details: ChatDetails) => void;
}

type Stage = "where" | "how" | "species" | "chat";

export const TIME_OPTIONS = ["Dawn", "Morning", "Midday", "Afternoon", "Evening", "Night"];
const WATER_OPTIONS = ["Freshwater", "Saltwater"];
const VESSEL_OPTIONS = ["On foot / wading", "Kayak", "Boat"];

const PlannerChat = ({ seedDetails, onSwitchToGuided, onCandidateCreated, onSpotReady }: Props) => {
  const [stage, setStage] = useState<Stage>("where");
  const [voiceMode, setVoiceMode] = useState(false);

  // Step 1 — where & when
  const [location, setLocation] = useState(seedDetails?.location || seedDetails?.body_of_water || "");
  const [date, setDate] = useState(seedDetails?.date || format(new Date(), "yyyy-MM-dd"));
  const [times, setTimes] = useState<string[]>(
    seedDetails?.time_available ? seedDetails.time_available.split(/,\s*/).filter((t) => TIME_OPTIONS.includes(t)) : [],
  );
  const { stage: micStage, startListening, stopListening } = useVoiceInput();

  // Species guidance
  const [waterTypes, setWaterTypes] = useState<string[]>([]);
  const [pickedSpecies, setPickedSpecies] = useState<string[]>(seedDetails?.species || []);
  const [vessel, setVessel] = useState<string[]>([]);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [details, setDetails] = useState<ChatDetails | null>(seedDetails || null);
  const [candidates, setCandidates] = useState<ExploreResult | null>(null);
  const [choices, setChoices] = useState<{ options: string[]; multi?: boolean } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);

  const [spots, setSpots] = useState<SpotLite[]>([]);
  const [species, setSpecies] = useState<string[]>([]);
  const [tackle, setTackle] = useState<{ name: string; category: string | null; species: string[] }[]>([]);
  const [mapOpen, setMapOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUserSpots().then(setSpots).catch(() => {});
    fetchUserTackle().then(setTackle).catch(() => {});
    fetchSpecies().then((s) => setSpecies(s.map((x) => x.primary_name))).catch(() => {});
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, candidates, choices]);

  const say = (text: string, force = false) => {
    if (voiceMode || force) speak(text);
  };

  const baseDetails = (): ChatDetails => ({
    ...(details || {}),
    location,
    date,
    time_available: times.join(", ") || undefined,
  });

  // ── Step 1 ──
  const handleLocationMic = () => {
    if (micStage === "listening") return stopListening();
    setVoiceMode(true);
    startListening((spoken) => setLocation(spoken));
  };

  const goHow = () => {
    if (!location.trim()) return toast.error("Tell us roughly where you're headed");
    setDetails(baseDetails());
    setStage("how");
    say("Do you want to pick the spot on a map, or get help choosing water based on the fish you're after?");
  };

  // ── Map path ──
  const handleMapCreated = async (created: { id: string }) => {
    try {
      const all = await fetchUserSpots();
      const spot = all.find((s) => s.id === created.id);
      if (spot) onSpotReady(spot, { ...baseDetails(), body_of_water: spot.body_of_water });
    } catch {
      toast.error("Spot saved, but it couldn't be loaded — pick it from your spots");
    }
  };

  // ── Species path ──
  const goSpecies = () => {
    setStage("species");
    say("Which species are you targeting? Tap as many as you like.");
  };

  const startGuidance = async () => {
    const d: ChatDetails = {
      ...baseDetails(),
      species: pickedSpecies,
      water_type: waterTypes.length === 1 ? waterTypes[0].toLowerCase() : undefined,
      vessel: vessel[0]?.startsWith("On foot") ? "foot" : vessel[0]?.toLowerCase(),
    };
    setDetails(d);
    setStage("chat");
    const opener = [
      `I'm fishing near ${location} on ${date}`,
      times.length ? `(${times.join(", ").toLowerCase()})` : "",
      pickedSpecies.length ? `targeting ${pickedSpecies.join(", ")}` : "",
      waterTypes.length === 1 ? `in ${waterTypes[0].toLowerCase()}` : "",
      vessel.length ? `fishing ${vessel.join(" or ").toLowerCase()}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    await send(`${opener}. Help me pick water.`, voiceMode, d, []);
  };

  const send = async (text: string, viaVoice = false, detailsOverride?: ChatDetails, history?: ChatMessage[]) => {
    const useVoice = voiceMode || viaVoice;
    if (viaVoice && !voiceMode) setVoiceMode(true);
    const ctxDetails = detailsOverride || details;
    const next: ChatMessage[] = [...(history ?? messages), { role: "user", content: text }];
    setMessages(next);
    setChoices(null);
    setPicked([]);
    setBusy(true);
    stopSpeaking();
    try {
      const turn = await planChat({
        messages: next,
        context: {
          today: format(new Date(), "yyyy-MM-dd"),
          spots: spots.map((s) => ({ id: s.id, name: s.name, body_of_water: s.body_of_water, state_code: s.state_code, site_type: s.site_type })),
          species,
          tackle,
          details: ctxDetails,
        },
      });
      const merged = turn.details ? { ...(ctxDetails || {}), ...turn.details } : ctxDetails;
      if (turn.details) setDetails(merged);
      if (turn.spots) setCandidates(turn.spots);
      if (turn.choices?.options?.length && !turn.spots) setChoices(turn.choices);
      setMessages((m) => [...m, { role: "assistant", content: turn.reply }]);
      if (useVoice) speak(turn.spots ? `${turn.reply} Tap one on the map to pick it.` : turn.reply);

      // AI matched one of the angler's saved spots — hand it to the next step.
      if (turn.planRequest) {
        const spot = spots.find((s) => s.id === turn.planRequest!.spot_id);
        if (spot) onSpotReady(spot, { ...(merged || {}), date: turn.planRequest.date || date });
      }
    } catch (e: any) {
      toast.error(e.message || "The planner had trouble responding");
    } finally {
      setBusy(false);
    }
  };

  const pickCandidate = async (candidate: CandidateSpot) => {
    if (savingCandidate) return;
    setSavingCandidate(true);
    try {
      const nextDetails: ChatDetails = {
        ...baseDetails(),
        ...(details || {}),
        body_of_water: candidate.name,
        species: details?.species?.length ? details.species : candidate.species,
      };
      const created = await createCandidatePlannedTrip({ candidate, date, details: nextDetails });
      toast.success("Spot saved");
      onCandidateCreated(created.spot, created.tripId, { ...nextDetails, date });
    } catch (e: any) {
      toast.error(e.message || "Failed to create the spot");
    } finally {
      setSavingCandidate(false);
    }
  };

  const voiceToggle = (
    <button
      onClick={() => {
        if (voiceMode) stopSpeaking();
        setVoiceMode(!voiceMode);
      }}
      className="text-xs font-medium text-muted-foreground flex items-center gap-1"
      aria-label={voiceMode ? "Turn spoken replies off" : "Turn spoken replies on"}
    >
      {voiceMode ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4" />}
      {voiceMode ? "Speaking replies" : "Replies muted"}
    </button>
  );

  // ── Step 1: where & when ──
  if (stage === "where") {
    return (
      <div className="space-y-4 pt-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Where and when?</h2>
          <p className="text-sm text-muted-foreground mt-1">A town or river and a date is plenty.</p>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> General area
          </label>
          <div className="flex items-center gap-2">
            <input
              value={micStage === "listening" ? "" : location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={micStage === "listening" ? "Listening…" : "e.g. Luling, TX or Guadalupe River"}
              className="flex-1 bg-transparent text-foreground font-semibold outline-none placeholder:text-muted-foreground placeholder:font-normal"
              style={{ fontSize: "16px" }}
            />
            <button
              onClick={handleLocationMic}
              aria-label="Say the area"
              className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${
                micStage === "listening" ? "bg-destructive animate-pulse" : "bg-secondary"
              }`}
            >
              {micStage === "listening" ? <Square className="w-4 h-4 text-secondary-foreground" /> : <Mic className="w-5 h-5 text-secondary-foreground" />}
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5" /> Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-transparent text-foreground text-lg font-semibold outline-none"
            style={{ fontSize: "16px" }}
          />
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Time of day <span className="font-normal">· pick all that apply</span>
          </p>
          <ChoiceChips options={TIME_OPTIONS} selected={times} onChange={setTimes} />
        </div>

        <button
          onClick={goHow}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Step 2: map or guidance ──
  if (stage === "how") {
    return (
      <div className="space-y-4 pt-4">
        <button onClick={() => setStage("where")} className="text-sm text-muted-foreground">← {location} · {date}</button>
        <h2 className="text-xl font-bold text-foreground">How do you want to pick the spot?</h2>

        <button onClick={() => setMapOpen(true)} className="w-full text-left p-5 rounded-2xl bg-surface border border-border active:bg-surface/80">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <MapIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">I know where — pick it on the map</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Drop pins on the water and link its flow or tide station.</p>
            </div>
          </div>
        </button>

        <button onClick={goSpecies} className="w-full text-left p-5 rounded-2xl bg-surface border border-border active:bg-surface/80">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Fish className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Help me choose by target fish</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Tell the AI what you're after and it suggests water on a map.</p>
            </div>
          </div>
        </button>

        <SpotCreationModal open={mapOpen} onOpenChange={setMapOpen} onSpotCreated={handleMapCreated} locationHint={location} />
      </div>
    );
  }

  // ── Species picker (guidance path) ──
  if (stage === "species") {
    const isSalt = waterTypes.length === 1 ? waterTypes[0] === "Saltwater" : undefined;
    const list = (isSalt === undefined ? species : species.filter((s) => speciesFitsWater(s, isSalt))).slice(0, 30);
    return (
      <div className="space-y-4 pt-4">
        <button onClick={() => setStage("how")} className="text-sm text-muted-foreground">← Back</button>
        <h2 className="text-xl font-bold text-foreground">What are you fishing for?</h2>

        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Water</p>
          <ChoiceChips options={WATER_OPTIONS} selected={waterTypes} onChange={setWaterTypes} />
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Target species · pick all that apply</p>
          <ChoiceChips options={list} selected={pickedSpecies} onChange={setPickedSpecies} />
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground">How you'll fish</p>
          <ChoiceChips options={VESSEL_OPTIONS} selected={vessel} onChange={setVessel} />
        </div>

        <button
          onClick={startGuidance}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5"
        >
          Find water <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Conversation → map of candidate waters ──
  const lastQuestion = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)]">
      <div className="flex items-center justify-between py-3">
        <button onClick={() => setStage("species")} className="text-sm text-muted-foreground">← Back</button>
        {voiceToggle}
      </div>

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
            regionHint={location || details?.location || null}
            onPick={pickCandidate}
            onNoneOfThese={() => {
              setCandidates(null);
              const q = "No problem — what didn't work about those?";
              setMessages((m) => [...m, { role: "assistant", content: q }]);
              setChoices({ options: ["Too far", "Wrong species", "Wrong kind of water", "Need boat access", "Need wade access"], multi: true });
              say(q);
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

      <div className="sticky bottom-0 bg-background pt-2 pb-3 space-y-2 border-t border-border/50">
        {/* Keep the question visible above the keyboard */}
        {composerFocused && lastQuestion && (
          <div className="text-sm text-foreground rounded-xl bg-surface border border-border px-3 py-2 max-h-28 overflow-y-auto">
            {lastQuestion.content}
          </div>
        )}
        {choices?.options?.length ? (
          <div className="space-y-2">
            <ChoiceChips options={choices.options} selected={picked} onChange={setPicked} multi={choices.multi !== false} />
            {picked.length > 0 && (
              <button
                onClick={() => send(picked.join(", "))}
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
              >
                Send {picked.length > 1 ? `${picked.length} answers` : picked[0]}
              </button>
            )}
          </div>
        ) : null}
        <VoiceTextComposer
          onSend={(t, v) => send(t, v)}
          onFocusChange={setComposerFocused}
          disabled={busy || savingCandidate}
          placeholder={savingCandidate ? "Saving spot…" : "Say or type your answer…"}
        />
        <button onClick={onSwitchToGuided} className="w-full py-2 text-xs font-medium text-muted-foreground flex items-center justify-center gap-1.5">
          <LayoutList className="w-3.5 h-3.5" />
          Pick from my saved spots instead
        </button>
      </div>
    </div>
  );
};

export default PlannerChat;
