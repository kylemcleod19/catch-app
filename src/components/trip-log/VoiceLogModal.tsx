import { Loader2, Mic, MicOff, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface ParsedTripData {
  start_time?: string;
  end_time?: string;
  date?: string;
  location?: string;
  notes?: string;
  catches?: { species: string; quantity: number; lure_or_bait?: string }[];
}

type VoiceStage = "idle" | "listening" | "parsing" | "done" | "error";

interface VoiceLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: VoiceStage;
  transcript: string;
  parsedData: ParsedTripData | null;
  errorMessage: string;
  onStartListening: () => void;
  onStopListening: () => void;
  onApply: () => void;
  children?: React.ReactNode;
}

const VoiceLogModal = ({
  open,
  onOpenChange,
  stage,
  transcript,
  parsedData,
  errorMessage,
  onStartListening,
  onStopListening,
  onApply,
  children,
}: VoiceLogModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Voice Log</DialogTitle>
          <DialogDescription>
            Dictate your trip details and we'll fill in the form for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Turnstile widget */}
          {children}
          {/* Mic control */}
          {(stage === "idle" || stage === "listening") && (
            <div className="flex flex-col items-center gap-3 py-4">
              <button
                type="button"
                onClick={stage === "listening" ? onStopListening : onStartListening}
                className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                  stage === "listening"
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                )}
              >
                {stage === "listening" ? (
                  <MicOff className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </button>
              <p className="text-sm text-muted-foreground">
                {stage === "listening" ? "Listening… tap to stop" : "Tap to start speaking"}
              </p>
            </div>
          )}

          {/* Transcript preview */}
          {transcript && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transcript
              </label>
              <div className="rounded-xl bg-muted/50 border border-border p-3 text-sm text-foreground">
                "{transcript}"
              </div>
            </div>
          )}

          {/* Parsing status */}
          {stage === "parsing" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              Parsing your trip details…
            </div>
          )}

          {/* Error */}
          {stage === "error" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-sm font-medium">
              <XCircle className="w-4 h-4" />
              {errorMessage || "Failed to parse voice input"}
            </div>
          )}

          {/* Parsed data preview */}
          {stage === "done" && parsedData && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircle2 className="w-4 h-4" />
                Parsed successfully
              </div>

              <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-2 text-sm">
                {parsedData.date && (
                  <Row label="Date" value={parsedData.date} />
                )}
                {parsedData.start_time && (
                  <Row label="Start" value={parsedData.start_time} />
                )}
                {parsedData.end_time && (
                  <Row label="End" value={parsedData.end_time} />
                )}
                {parsedData.location && (
                  <Row label="Location" value={parsedData.location} />
                )}
                {parsedData.catches && parsedData.catches.length > 0 && (
                  <div>
                    <span className="font-medium text-muted-foreground">Catches:</span>
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {parsedData.catches.map((c, i) => (
                        <li key={i} className="text-foreground">
                          {c.quantity}× {c.species}
                          {c.lure_or_bait && (
                            <span className="text-muted-foreground"> — {c.lure_or_bait}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {parsedData.notes && (
                  <Row label="Notes" value={parsedData.notes} />
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {stage === "done" && (
              <Button
                type="button"
                variant="catch"
                className="flex-1"
                onClick={onApply}
              >
                Apply to Form
              </Button>
            )}
            {(stage === "error" || stage === "done") && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={onStartListening}
              >
                Try Again
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between">
    <span className="font-medium text-muted-foreground">{label}</span>
    <span className="text-foreground">{value}</span>
  </div>
);

export default VoiceLogModal;
