import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Sparkles, Fish, MapPin, ChevronRight, Waves, Mountain, Droplets } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/lib/googleMaps";
import PlanMap, { type PlanPin } from "../PlanMap";
import ChoiceChips from "../ChoiceChips";
import SuggestionList from "./SuggestionList";
import { fetchSpecies, speciesFitsWater } from "@/lib/species";
import {
  fetchNearbyWaters,
  suggestSpots,
  createSpotAt,
  type Area,
  type WaterKind,
  type NearbyWater,
  type SpotSuggestion,
} from "@/lib/planSuggest";
import type { SpotLite } from "@/lib/planTrip";

interface Props {
  date: string;
  area: Area | null;
  waterType: WaterKind | null;
  onArea: (a: Area | null) => void;
  onWaterType: (w: WaterKind) => void;
  onSpotCreated: (spot: SpotLite, species: string[]) => void;
}

const WATER_TYPES: { v: WaterKind; label: string; icon: typeof Waves }[] = [
  { v: "Stream", label: "River / stream", icon: Droplets },
  { v: "Lake", label: "Lake", icon: Mountain },
  { v: "Tidal", label: "Saltwater / tidal", icon: Waves },
];

type Choice =
  | { kind: "suggestion"; idx: number }
  | { kind: "water"; idx: number }
  | { kind: "custom"; lat: number; lng: number };

const WhereStep = ({ date, area, waterType, onArea, onWaterType, onSpotCreated }: Props) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const { isLoaded } = useGoogleMaps(apiKey);
  const [query, setQuery] = useState(area?.label || "");
  const [geocoding, setGeocoding] = useState(false);

  const [nearby, setNearby] = useState<NearbyWater[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [suggestions, setSuggestions] = useState<SpotSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [bySpecies, setBySpecies] = useState(false);
  const [speciesAll, setSpeciesAll] = useState<string[]>([]);
  const [pickedSpecies, setPickedSpecies] = useState<string[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data }) => data?.key && setApiKey(data.key));
    fetchSpecies().then((s) => setSpeciesAll(s.map((x) => x.primary_name))).catch(() => {});
  }, []);

  const findArea = async () => {
    if (!query.trim()) return;
    if (!isLoaded) return toast.error("Map is still loading — try again in a second");
    setGeocoding(true);
    try {
      const { results } = await Promise.race([
        new google.maps.Geocoder().geocode({ address: query, region: "us" }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
      ]);
      const r = results?.[0];
      if (!r) throw new Error();
      const stateAbbr =
        r.address_components.find((c) => c.types.includes("administrative_area_level_1"))?.short_name || null;
      onArea({ label: r.formatted_address.replace(/, USA$/, ""), lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), stateAbbr });
      setSuggestions([]);
      setChoice(null);
    } catch {
      toast.error("Couldn't find that place — try a town or river name");
    } finally {
      setGeocoding(false);
    }
  };

  useEffect(() => {
    if (!area || !waterType) return;
    setLoadingNearby(true);
    setNearby([]);
    setSuggestions([]);
    setChoice(null);
    fetchNearbyWaters(area, waterType)
      .then(setNearby)
      .catch(() => setNearby([]))
      .finally(() => setLoadingNearby(false));
  }, [area, waterType]);

  const runSuggest = async (species: string[]) => {
    if (!area || !waterType) return;
    setSuggesting(true);
    setChoice(null);
    try {
      const items = await suggestSpots({ area, waterType, date, species, nearby });
      setSuggestions(items);
      if (!items.length) toast.message("No suggestions this time — try a nearby water or drop a pin");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSuggesting(false);
    }
  };

  const pins: PlanPin[] = useMemo(() => {
    const p: PlanPin[] = [];
    nearby.forEach((n, i) => p.push({ id: `w${i}`, lat: n.lat, lng: n.lng, kind: "water" }));
    suggestions.forEach((s, i) => p.push({ id: `s${i}`, lat: s.lat, lng: s.lng, kind: "suggestion", label: String(i + 1) }));
    if (choice?.kind === "custom") p.push({ id: "custom", lat: choice.lat, lng: choice.lng, kind: "custom" });
    return p;
  }, [nearby, suggestions, choice]);

  const selectedPinId =
    choice?.kind === "suggestion" ? `s${choice.idx}` : choice?.kind === "water" ? `w${choice.idx}` : choice ? "custom" : null;

  const confirm = async () => {
    if (!choice || !area || !waterType) return;
    let name = "", body = "", lat = 0, lng = 0;
    if (choice.kind === "suggestion") {
      const s = suggestions[choice.idx];
      name = s.name; body = nearby[0]?.name && waterType !== "Tidal" ? nearby[0].name : s.name; lat = s.lat; lng = s.lng;
    } else if (choice.kind === "water") {
      const w = nearby[choice.idx];
      name = w.name; body = w.name; lat = w.lat; lng = w.lng;
    } else {
      name = customName.trim() || `Spot near ${area.label.split(",")[0]}`;
      body = nearby[0]?.name || name; lat = choice.lat; lng = choice.lng;
    }
    setSaving(true);
    try {
      const spot = await createSpotAt({ name, bodyOfWater: body, lat, lng, waterType, stateAbbr: area.stateAbbr });
      const sp = choice.kind === "suggestion" ? (pickedSpecies.length ? pickedSpecies : []) : pickedSpecies;
      onSpotCreated(spot, sp);
    } catch (e: any) {
      toast.error(e.message || "Couldn't save the spot");
    } finally {
      setSaving(false);
    }
  };

  const speciesOptions = useMemo(() => {
    const list = waterType ? speciesAll.filter((s) => speciesFitsWater(s, waterType === "Tidal")) : speciesAll;
    return list.slice(0, 24);
  }, [speciesAll, waterType]);

  return (
    <div className="space-y-4 pt-4">
      <h2 className="text-xl font-bold text-foreground">Where are you headed?</h2>

      {/* Area */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Town, area, or river
        </label>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); findArea(); }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. San Marcos, TX"
            className="flex-1 bg-transparent text-foreground font-semibold outline-none placeholder:text-muted-foreground placeholder:font-normal"
            style={{ fontSize: "16px" }}
          />
          <button type="submit" aria-label="Find area" className="w-11 h-11 shrink-0 rounded-full bg-secondary flex items-center justify-center">
            {geocoding ? <Loader2 className="w-4 h-4 animate-spin text-secondary-foreground" /> : <Search className="w-4 h-4 text-secondary-foreground" />}
          </button>
        </form>
        {area && <p className="text-xs text-muted-foreground">Found: <span className="text-foreground font-medium">{area.label}</span></p>}
      </div>

      {area && (
        <PlanMap
          center={{ lat: area.lat, lng: area.lng }}
          pins={waterType ? pins : []}
          selectedId={selectedPinId}
          onPinClick={(id) => {
            if (id.startsWith("s")) setChoice({ kind: "suggestion", idx: +id.slice(1) });
            else if (id.startsWith("w")) setChoice({ kind: "water", idx: +id.slice(1) });
          }}
          onMapClick={waterType ? (lat, lng) => setChoice({ kind: "custom", lat, lng }) : undefined}
        />
      )}

      {/* Water type (required) */}
      {area && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Type of water <span className="text-destructive">*</span></p>
          <div className="grid grid-cols-3 gap-2">
            {WATER_TYPES.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                onClick={() => onWaterType(v)}
                className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 ${
                  waterType === v ? "bg-primary text-primary-foreground border-primary" : "bg-surface text-foreground border-border"
                }`}
              >
                <Icon className="w-5 h-5" /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {area && waterType && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setBySpecies(false); runSuggest([]); }}
              disabled={suggesting}
              className="py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {suggesting && !bySpecies ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Suggest spots
            </button>
            <button
              onClick={() => setBySpecies(!bySpecies)}
              className={`py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${
                bySpecies ? "border-primary text-primary" : "border-border text-foreground"
              }`}
            >
              <Fish className="w-4 h-4" /> By species
            </button>
          </div>

          {bySpecies && (
            <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
              <p className="text-xs font-medium text-muted-foreground">What do you want to catch?</p>
              <ChoiceChips options={speciesOptions} selected={pickedSpecies} onChange={setPickedSpecies} />
              <button
                onClick={() => runSuggest(pickedSpecies)}
                disabled={suggesting}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {pickedSpecies.length ? `Suggest spots for ${pickedSpecies.length === 1 ? pickedSpecies[0] : `${pickedSpecies.length} species`}` : "I'm not sure — suggest anyway"}
              </button>
            </div>
          )}

          {suggestions.length > 0 && (
            <SuggestionList
              numbered
              items={suggestions.map((s, i) => ({
                id: String(i),
                title: s.name,
                why: s.why,
                meta: s.species?.length ? s.species.slice(0, 4).join(" · ") : undefined,
              }))}
              selectedIds={choice?.kind === "suggestion" ? [String(choice.idx)] : []}
              onToggle={(id) => setChoice({ kind: "suggestion", idx: +id })}
            />
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {waterType === "Tidal" ? "Nearby tide stations" : "Monitored waters nearby"}
              <span className="normal-case font-normal"> · blue pins</span>
            </p>
            {loadingNearby ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : nearby.length === 0 ? (
              <p className="text-xs text-muted-foreground">None found close by — use suggestions or tap the map to drop a pin.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nearby.map((n, i) => {
                  const sel = choice?.kind === "water" && choice.idx === i;
                  return (
                    <button
                      key={n.name}
                      onClick={() => setChoice({ kind: "water", idx: i })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                        sel ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"
                      }`}
                    >
                      {n.name} <span className="opacity-70">· {n.miles.toFixed(0)} mi</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Or tap anywhere on the map to drop your own pin.</p>
          </div>

          {choice?.kind === "custom" && (
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Name this spot (optional)"
              className="w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-foreground outline-none"
              style={{ fontSize: "16px" }}
            />
          )}

          <button
            onClick={confirm}
            disabled={!choice || saving}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {choice ? "Use this spot" : "Pick a spot to continue"} {!saving && <ChevronRight className="w-4 h-4" />}
          </button>
        </>
      )}
    </div>
  );
};

export default WhereStep;
