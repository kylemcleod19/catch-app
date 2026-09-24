import { Calendar, Clock, ChevronRight, CloudSun, History } from "lucide-react";
import ChoiceChips from "../ChoiceChips";
import { TIME_OPTIONS, hasForecast, daysOut } from "@/lib/planSuggest";

interface Props {
  date: string;
  times: string[];
  onDate: (d: string) => void;
  onTimes: (t: string[]) => void;
  onNext: () => void;
}

const WhenStep = ({ date, times, onDate, onTimes, onNext }: Props) => {
  const forecast = hasForecast(date);
  const past = daysOut(date) < 0;
  return (
    <div className="space-y-4 pt-4">
      <h2 className="text-xl font-bold text-foreground">When are you going?</h2>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
          <Calendar className="w-3.5 h-3.5" /> Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => onDate(e.target.value)}
          className="w-full bg-transparent text-foreground font-semibold outline-none"
          style={{ fontSize: "16px" }}
        />
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
          {forecast ? (
            <><CloudSun className="w-3.5 h-3.5 text-primary" /> Forecast available for this date</>
          ) : (
            <><History className="w-3.5 h-3.5" /> {past ? "Past date" : "Too far out for a forecast"} — we'll show recent conditions</>
          )}
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Time of day <span className="font-normal">· optional, pick any</span>
        </p>
        <ChoiceChips options={TIME_OPTIONS} selected={times} onChange={onTimes} />
      </div>

      <button
        onClick={onNext}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5"
      >
        Next <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default WhenStep;
