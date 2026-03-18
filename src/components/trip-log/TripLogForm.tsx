import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import LocationPicker from "./LocationPicker";
import CatchLogger from "./CatchLogger";

interface TripLogFormProps {
  tripId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TripLogForm = ({ tripId, onClose, onSuccess }: TripLogFormProps) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(true);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("12:00");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState("");
  const [notes, setNotes] = useState("");

  // Load existing draft trip data
  useEffect(() => {
    supabase
      .from("fishing_trips")
      .select("*")
      .eq("id", tripId)
      .single()
      .then(({ data }) => {
        if (data) {
          setTitle(data.title || "");
          setDate(new Date(data.started_at));
          const start = new Date(data.started_at);
          setStartTime(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
          if (data.ended_at) {
            const end = new Date(data.ended_at);
            setEndTime(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
          }
          if (data.latitude && data.longitude) {
            setLocation({ lat: data.latitude, lng: data.longitude });
          }
          setLocationName(data.location_name || "");
          setNotes(data.notes || "");
        }
        setLoadingTrip(false);
      });
  }, [tripId]);

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

      const { error } = await supabase
        .from("fishing_trips")
        .update({
          title: title || `Trip on ${format(date, "MMM d")}`,
          location_name: locationName || null,
          latitude: location?.lat ?? null,
          longitude: location?.lng ?? null,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          notes: notes || null,
          status: "completed",
        } as any)
        .eq("id", tripId);

      if (error) throw error;

      toast.success("Trip logged!");
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

      {/* Title */}
      <Input placeholder="Trip name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" />

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

      {/* Location */}
      <LocationPicker location={location} locationName={locationName} onLocationChange={setLocation} onLocationNameChange={setLocationName} />

      {/* Catches */}
      {user && <CatchLogger tripId={tripId} userId={user.id} />}

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
