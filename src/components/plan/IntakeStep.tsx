import { useState } from "react";
import { Mic, Loader2, Check, X, ChevronRight } from "lucide-react";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { parsePlannerVoice, type PlannerIntake } from "@/lib/planTrip";
import { toast } from "sonner";

interface Props {
  mode: "explore" | "spot";
  onComplete: (intake: PlannerIntake) => void;
  onBack: () => void;
}

const FAVORABILITY_COLORS: Record<string, string> = {
  vessel: "bg-primary/10 text-primary",
  species: "bg-primary/10 text-primary",
  method: "bg-primary/10 text-primary",
};

const IntakeStep = ({ mode, onComplete, onBack }: Props) => {
  const { stage, transcript, error, startListening, reset } = useVoiceInput();
  const [parsed, setParsed] = useState<PlannerIntake | null>(null);
  const [parsing, setParsing] = useState(false);

  const context = mode === "explore"
    ? "The user wants to explore a new fishing area."
    : "The user wants to plan at an existing spot they fish.";

  const handleVoice = async (text: string) => {
    setParsing(true);
    try {
      const result = await parsePlannerVoice(text, context);
      setParsed(result);
      // Keep stage as "done" so the user sees the transcript + parsed data
    } catch (e: any) {
      toast.error(e.message || "Failed to parse your input");
    } finally {
      setParsing(false);
    }
  };

  const handleMic = () => {
    if (stage === "listening") return;
    setParsed(null);
    startListening(handleVoice);
  };

  const confirm = () => {
    if (!parsed) return;
    onComplete(parsed);
  };

  const skip = () => {
    onComplete({
      vessel: null,
      species: [],
      method: null,
      time_available: null,
      travel_distance: null,
      date: null,
      location_query: null,
      notes: null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="text-center pt-4">
        <h2 className="text-xl font-bold text-foreground">Tell me about your trip</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "explore"
            ? "Where are you going, when, and what are you after?"
            : "What are you fishing for, and how do you like to fish?"}
        </p>
      </div>

      {/* Mic button */}
      <div className="flex flex-col items-center gap-3 py-6">
        <button
          onClick={handleMic}
          disabled={parsing}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
            stage === "listening"
              ? "bg-red-500 animate-pulse"
              : "bg-primary active:scale-95"
          }`}
        >
          {parsing ? (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </button>
        <p className="text-sm font-medium text-muted-foreground">
          {stage === "listening"
            ? "Listening…"
            : parsing
            ? "Processing…"
            : "Tap to speak"}
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-600 flex items-start gap-2">
          <X className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="p-4 rounded-xl bg-surface border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-1">You said</p>
          <p className="text-sm text-foreground">{transcript}</p>
        </div>
      )}

      {/* Parsed results */}
      {parsed && (
        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Check className="w-4 h-4 text-primary" />
            AI extracted
          </div>
          {parsed.location_query && (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-20">Area</span>
              <span className="font-medium text-foreground">{parsed.location_query}</span>
            </div>
          )}
          {parsed.date && (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-20">Date</span>
              <span className="font-medium text-foreground">{parsed.date}</span>
            </div>
          )}
          {parsed.vessel && (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-20">Vessel</span>
              <span className="font-medium text-foreground capitalize">{parsed.vessel}</span>
            </div>
          )}
          {parsed.species?.length > 0 && (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-20">Species</span>
              <span className="font-medium text-foreground">{parsed.species.join(", ")}</span>
            </div>
          )}
          {parsed.method && (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-20">Method</span>
              <span className="font-medium text-foreground capitalize">{parsed.method}</span>
            </div>
          )}
          {parsed.time_available && (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-20">Time</span>
              <span className="font-medium text-foreground">{parsed.time_available}</span>
            </div>
          )}
          {parsed.notes && (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-20">Notes</span>
              <span className="font-medium text-foreground">{parsed.notes}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground active:bg-surface transition-colors"
        >
          Back
        </button>
        <button
          onClick={skip}
          className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground active:bg-surface transition-colors"
        >
          Skip
        </button>
        {parsed && (
          <button
            onClick={confirm}
            className="flex-1 py-3 rounded-xl bg-primary text-sm font-semibold text-white active:scale-95 transition-all flex items-center justify-center gap-1"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default IntakeStep;
