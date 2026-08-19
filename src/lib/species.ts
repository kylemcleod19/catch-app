import { supabase } from "@/integrations/supabase/client";

export interface Species {
  id: string;
  primary_name: string;
  nicknames: string[];
}

/** Common starting points offered when the shared list is empty. */
export const COMMON_SPECIES = [
  "Largemouth Bass",
  "Smallmouth Bass",
  "Rainbow Trout",
  "Brown Trout",
  "Brook Trout",
  "Bluegill",
  "Crappie",
  "Walleye",
  "Northern Pike",
  "Musky",
  "Channel Catfish",
  "Carp",
  "Striped Bass",
  "Bluefish",
  "Fluke / Summer Flounder",
  "Redfish",
  "Sea Trout",
  "Tautog",
  "Black Sea Bass",
  "Atlantic Salmon",
];

export const fetchSpecies = async (): Promise<Species[]> => {
  const { data, error } = await supabase
    .from("species")
    .select("id, primary_name, nicknames")
    .order("primary_name", { ascending: true });
  if (error) throw error;
  return (data as Species[]) || [];
};

/** Find an existing species by name/nickname, or create it. */
export const findOrCreateSpecies = async (name: string, userId: string): Promise<Species> => {
  const clean = name.trim();
  const all = await fetchSpecies();
  const match = all.find(
    (s) =>
      s.primary_name.toLowerCase() === clean.toLowerCase() ||
      (s.nicknames || []).some((n) => n.toLowerCase() === clean.toLowerCase())
  );
  if (match) return match;

  const { data, error } = await supabase
    .from("species")
    .insert({ primary_name: clean, created_by: userId })
    .select("id, primary_name, nicknames")
    .single();
  if (error) throw error;
  return data as Species;
};

export const matchesSpeciesQuery = (s: Species, q: string) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    s.primary_name.toLowerCase().includes(needle) ||
    (s.nicknames || []).some((n) => n.toLowerCase().includes(needle))
  );
};

// ── Habitat classification ──
// Used to keep the target-species picker relevant to the water being fished:
// no tarpon on a hill-country river, no rainbow trout on a bay flat.

export type Habitat = "freshwater" | "saltwater" | "both";

const SALT_KEYWORDS = [
  "tarpon", "bonefish", "permit", "snook", "redfish", "red drum", "black drum", "sea trout",
  "speckled trout", "seatrout", "flounder", "fluke", "tautog", "sea bass", "bluefish", "cobia",
  "mahi", "dorado", "tuna", "wahoo", "marlin", "sailfish", "grouper", "snapper", "jack",
  "amberjack", "pompano", "sheepshead", "shark", "mackerel", "halibut", "ling", "triggerfish",
  "barracuda", "kingfish", "croaker", "whiting", "sea robin", "porgy", "rockfish (pacific)",
];

const FRESH_KEYWORDS = [
  "largemouth", "smallmouth", "spotted bass", "guadalupe bass", "bass", "crappie", "bluegill",
  "sunfish", "panfish", "perch", "walleye", "sauger", "pike", "musky", "muskellunge", "pickerel",
  "rainbow trout", "brown trout", "brook trout", "cutthroat", "lake trout", "golden trout",
  "trout", "grayling", "catfish", "bullhead", "carp", "gar", "bowfin", "sucker", "whitefish",
  "kokanee", "burbot", "drum (freshwater)",
];

// Species that legitimately live in both, or run between them.
const BOTH_KEYWORDS = [
  "striped bass", "striper", "hybrid striped bass", "white bass", "salmon", "steelhead",
  "shad", "sturgeon", "eel", "snakehead", "tilapia", "alligator gar",
];

/** Best-effort habitat for a species name. Unknown names are treated as "both". */
export const speciesHabitat = (name: string): Habitat => {
  const n = name.trim().toLowerCase();
  const hit = (list: string[]) => list.some((k) => n.includes(k));
  if (hit(BOTH_KEYWORDS)) return "both";
  if (hit(SALT_KEYWORDS)) return "saltwater";
  if (hit(FRESH_KEYWORDS)) return "freshwater";
  return "both";
};

/** True when the species is plausible on the given water. */
export const speciesFitsWater = (name: string, saltwater: boolean) => {
  const h = speciesHabitat(name);
  return h === "both" || (saltwater ? h === "saltwater" : h === "freshwater");
};
