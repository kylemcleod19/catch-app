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
