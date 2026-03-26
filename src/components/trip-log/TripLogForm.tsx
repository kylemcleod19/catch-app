import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { CalendarIcon, X, Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import SpotPicker from "@/components/spots/SpotPicker";
import CatchLogger, { CatchLoggerHandle } from "./CatchLogger";
import VoiceLogModal, { ParsedTripData } from "./VoiceLogModal";
import WaterDataSection, { WaterFlowSnapshot } from "./WaterDataSection";

interface TripLogFormProps {
  tripId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TripLogForm = ({ tripId, onClose, onSuccess }: TripLogFormProps) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(true);

  const [date, setDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("12:00");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [waterSnapshot, setWaterSnapshot] = useState<WaterFlowSnapshot | null>(null);

  // Voice dictation
  const catchLoggerRef = useRef<CatchLoggerHandle>(null);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceStage, setVoiceStage] = useState<"idle" | "listening" | "parsing" | "done" | "error">("idle");
  const [transcript, setTranscript] = useState("");
  const [parsedData, setParsedData] = useState<ParsedTripData | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef<any>(null);

  // Load existing draft trip data
  useEffect(() => {
    supabase
      .from("fishing_trips")
      .select("*")
      .eq("id", tripId)
      .single()
      .then(({ data }) => {
        if (data) {
          setDate(new Date(data.started_at));
          const start = new Date(data.started_at);
          setStartTime(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
          if (data.ended_at) {
            const end = new Date(data.ended_at);
            setEndTime(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
          }
          if (data.spot_id) {
            setSpotId(data.spot_id);
          }
          setNotes(data.notes || "");
          if (data.water_flow_snapshot) {
            setWaterSnapshot(data.water_flow_snapshot as unknown as WaterFlowSnapshot);
          }
        }
        setLoadingTrip(false);
      });
  }, [tripId]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser. Please try Chrome or Edge.");
      setVoiceStage("error");
      setVoiceError("Your browser does not support speech recognition. Please use Chrome or Edge.");
      return;
    }

    setVoiceStage("listening");
    setTranscript("");
    setParsedData(null);
    setVoiceError("");

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = async (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        setVoiceStage("parsing");

        try {
          const { data, error } = await supabase.functions.invoke("parse-trip-voice", {
            body: { transcript: text },
          });

          if (error) throw error;
          setParsedData(data);
          setVoiceStage("done");
        } catch (err: any) {
          setVoiceError(err.message || "Failed to parse voice input");
          setVoiceStage("error");
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setVoiceError("Microphone access denied. Please allow microphone permissions in your browser settings.");
        } else if (event.error === "no-speech") {
          setVoiceError("No speech detected. Please try again and speak clearly.");
        } else if (event.error === "network") {
          setVoiceError("Network error during speech recognition. Check your internet connection.");
        } else {
          setVoiceError(`Speech recognition failed (${event.error}). Try again or use Chrome.`);
        }
        setVoiceStage("error");
      };

      recognition.onend = () => {
        setVoiceStage((s) => (s === "listening" ? "idle" : s));
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error("Failed to start speech recognition:", err);
      setVoiceError("Failed to start speech recognition. Please try Chrome or Edge.");
      setVoiceStage("error");
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const applyParsedData = useCallback(async () => {
    if (!parsedData) return;
    if (parsedData.start_time) setStartTime(parsedData.start_time);
    if (parsedData.end_time) setEndTime(parsedData.end_time);
    if (parsedData.date) setDate(new Date(parsedData.date + "T00:00:00"));
    if (parsedData.notes) setNotes((prev) => (prev ? prev + "\n" + parsedData.notes : parsedData.notes!));

    if (parsedData.catches?.length && catchLoggerRef.current) {
      await catchLoggerRef.current.addBulkCatches(parsedData.catches);
    }

    toast.success("Voice data applied to form!");
    setVoiceModalOpen(false);
    setVoiceStage("idle");
  }, [parsedData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      const startedAt = new Date(date);
      const [sh, sm] = startTime.split(":").map(Number);
      startedAt.setHours(sh, sm, 0, 0);

      const endedAt = new Date(date);
      const [eh, em] = endTime.split(":").map(Number);
      endedAt.setHours(eh, em, 0, 0);

      // Auto-generate title from spot + date + species
      const parts: string[] = [];
      if (spotId) {
        const { data: spot } = await supabase
          .from("spots")
          .select("name, body_of_water")
          .eq("id", spotId)
          .single();
        if (spot) parts.push(spot.body_of_water || spot.name || "");
      }
      parts.push(format(date, "MMM d"));
      const { data: catches } = await supabase
        .from("catches")
        .select("species, quantity")
        .eq("trip_id", tripId);
      if (catches?.length) {
        const speciesCounts: Record<string, number> = {};
        catches.forEach((c) => {
          speciesCounts[c.species] = (speciesCounts[c.species] || 0) + c.quantity;
        });
        const topSpecies = Object.entries(speciesCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 2)
          .map(([name]) => name);
        if (topSpecies.length) parts.push(`– ${topSpecies.join(" & ")}`);
      }
      const finalTitle = parts.filter(Boolean).join(" · ");

      const { error } = await supabase
        .from("fishing_trips")
        .update({
          title: finalTitle || `Trip on ${format(date, "MMM d")}`,
          spot_id: spotId ?? null,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          notes: notes || null,
          status: "completed",
          water_flow_snapshot: waterSnapshot ? (waterSnapshot as any) : null,
        } as any)
        .eq("id", tripId);

      if (error) throw error;

      toast.success("Trip saved!");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to save trip");
    } finally {
      setSaving(false);
    }
  };

  if (loadingTrip) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Log a Trip</h2>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Voice Log Button */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 rounded-xl gap-2 text-base font-medium border-primary/30 text-primary hover:bg-primary/5"
        onClick={() => {
          setVoiceStage("idle");
          setTranscript("");
          setParsedData(null);
          setVoiceError("");
          setVoiceModalOpen(true);
        }}
      >
        <Mic className="w-5 h-5" />
        Voice Log
      </Button>

      <VoiceLogModal
        open={voiceModalOpen}
        onOpenChange={setVoiceModalOpen}
        stage={voiceStage}
        transcript={transcript}
        parsedData={parsedData}
        errorMessage={voiceError}
        onStartListening={startListening}
        onStopListening={stopListening}
        onApply={applyParsedData}
      />

      {/* Date & Times */}
      <div className="grid grid-cols-3 gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("rounded-xl justify-start text-left font-normal", !date && "text-muted-foreground")}>
              <CalendarIcon className="w-4 h-4 mr-1.5" />
              {format(date, "MMM d")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <div className="relative">
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-xl text-sm" />
          <span className="absolute -top-2 left-2 text-[10px] font-medium text-muted-foreground bg-background px-1">Start</span>
        </div>
        <div className="relative">
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-xl text-sm" />
          <span className="absolute -top-2 left-2 text-[10px] font-medium text-muted-foreground bg-background px-1">End</span>
        </div>
      </div>

      {/* Spot */}
      <SpotPicker spotId={spotId} onSpotChange={setSpotId} tripId={tripId} />

      {/* Catches */}
      {user && <CatchLogger ref={catchLoggerRef} tripId={tripId} userId={user.id} />}

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Notes</label>
        <Textarea placeholder="Water conditions, weather notes, etc." value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl min-h-[80px]" />
      </div>

      {/* Submit */}
      <Button type="submit" variant="catch" size="lg" className="w-full" disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save Trip
      </Button>
    </form>
  );
};

export default TripLogForm;
