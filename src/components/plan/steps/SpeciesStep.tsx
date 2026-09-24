import { useEffect, useMemo, useState } from "react";
import { Fish, Sparkles, Loader2, ChevronRight, Box } from "lucide-react";
import { toast } from "sonner";
import ChoiceChips from "../ChoiceChips";
import SuggestionList from "./SuggestionList";
import { fetchSpecies, speciesFitsWater } from "@/lib/species";
import { suggestSpecies, type SpeciesSuggestion, type WaterKind } from "@/lib/planSuggest";
import { fetchPastInsights, fetchUserTackle, type SpotLite, type PastInsights } from "@/lib/planTrip";

interface Props {
  spot: SpotLite;
  date: string;
  species: string[];
  tackle: string[];
  onSpecies: (s: string[]) => void;
  onTackle: (t: string[]) => void;
  onBuild: () => void;
}

const SpeciesStep = ({ spot, date, species, tackle, onSpecies, onTackle, onBuild }: Props) => {
  const tidal = spot.is_tidal || spot.site_type === "Tidal";
  const [all, setAll] = useState<string[]>([]);
  const [tackleList, setTackleList] = useState<string[]>([]);
  const [insights, setInsights] = useState<PastInsights | null>(null);
  const [suggestions, setSuggestions] = useState<SpeciesSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSpecies().then((s) => setAll(s.map((x) => x.primary_name))).catch(() => {});
    fetchUserTackle().then((t) => setTackleList(t.map((x) => x.name))).catch(() => {});
    fetchPastInsights(spot.id).then(setInsights).catch(() => {});
  }, [spot.id]);

  const options = useMemo(() => {
    const past = insights?.topSpecies || [];
    const local = all.filter((s) => speciesFitsWater(s, tidal));
    return Array.from(new Set([...past, ...species, ...local])).slice(0, 20);
  }, [all, insights, species, tidal]);

  const runSuggest = async () => {
    setLoading(true);
    try {
      const p = spot.spot_points?.[0];
      setSuggestions(
        await suggestSpecies({
          waterName: `${spot.name || spot.body_of_water}${spot.body_of_water && spot.name !== spot.body_of_water ? ` on ${spot.body_of_water}` : ""}`,
          waterType: spot.site_type as WaterKind,
          date,
          lat: p?.latitude,
          lng: p?.longitude,
          pastSpecies: insights?.topSpecies,
        }),
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (name: string) =>
    onSpecies(species.includes(name) ? species.filter((s) => s !== name) : [...species, name]);

  return (
    <div className="space-y-4 pt-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">What are you after?</h2>
        <p className="text-sm text-muted-foreground mt-1">Optional — skip it and the plan will suggest what's likely.</p>
      </div>

      <button
        onClick={runSuggest}
        disabled={loading}
        className="w-full py-3 rounded-xl border border-primary text-primary text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Suggest species for this water
      </button>

      {suggestions.length > 0 && (
        <SuggestionList
          items={suggestions.map((s) => ({ id: s.name, title: s.name, why: s.why }))}
          selectedIds={species}
          onToggle={toggle}
        />
      )}

      <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Fish className="w-3.5 h-3.5" /> Species
          {insights?.topSpecies?.length ? <span className="font-normal">· your top here listed first</span> : null}
        </p>
        <ChoiceChips options={options} selected={species} onChange={onSpecies} />
      </div>

      {tackleList.length > 0 && (
        <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5" /> Tackle you're bringing <span className="font-normal">· optional</span>
          </p>
          <ChoiceChips options={tackleList.slice(0, 24)} selected={tackle} onChange={onTackle} />
        </div>
      )}

      <button
        onClick={onBuild}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5"
      >
        {species.length ? "Build my day plan" : "Skip — surprise me"} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default SpeciesStep;
