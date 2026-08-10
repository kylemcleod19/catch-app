import { supabase } from "@/integrations/supabase/client";
import type { Species } from "@/lib/species";

export const TACKLE_TYPES = [
  "Fly",
  "Lure",
  "Bait",
  "Jig",
  "Soft Plastic",
  "Spoon",
  "Spinner",
  "Fly Line / Leader",
  "Other",
] as const;

export type TackleType = (typeof TACKLE_TYPES)[number];

export interface TackleVariant {
  id: string;
  tackle_id: string;
  color: string | null;
  size: string | null;
  photo_url: string | null;
  notes: string | null;
  is_primary: boolean;
  sort_order: number;
  photoSignedUrl?: string | null;
}

export const variantLabel = (v: { color: string | null; size: string | null }) =>
  [v.color, v.size].filter(Boolean).join(" · ");

export interface TackleItem {
  id: string;
  user_id: string;
  name: string;
  type: string;
  purchase_location: string | null;
  presentation_notes: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  species: Species[];
  variants: TackleVariant[];
  photoSignedUrl?: string | null;
}

const BUCKET = "tackle-photos";

export const signPhoto = async (path: string | null): Promise<string | null> => {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
};

export const uploadTacklePhoto = async (file: File, userId: string): Promise<string> => {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
};

export const deleteTacklePhoto = async (path: string | null) => {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
};

interface RawTackle {
  id: string;
  user_id: string;
  name: string;
  type: string;
  purchase_location: string | null;
  presentation_notes: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  tackle_species: { species: Species | null }[] | null;
}

export const fetchTackle = async (userId: string): Promise<TackleItem[]> => {
  const { data, error } = await supabase
    .from("tackle")
    .select(
      "id, user_id, name, type, purchase_location, presentation_notes, notes, photo_url, created_at, tackle_species(species(id, primary_name, nicknames))"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data as unknown as RawTackle[]) || [];
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      type: r.type,
      purchase_location: r.purchase_location,
      presentation_notes: r.presentation_notes,
      notes: r.notes,
      photo_url: r.photo_url,
      created_at: r.created_at,
      species: (r.tackle_species || []).map((ts) => ts.species).filter(Boolean) as Species[],
      photoSignedUrl: await signPhoto(r.photo_url),
    }))
  );
};

export interface TackleInput {
  name: string;
  type: string;
  purchase_location: string | null;
  presentation_notes: string | null;
  notes: string | null;
  photo_url: string | null;
  speciesIds: string[];
}

export const saveTackle = async (
  userId: string,
  input: TackleInput,
  existingId?: string
): Promise<string> => {
  const payload = {
    user_id: userId,
    name: input.name.trim(),
    type: input.type,
    purchase_location: input.purchase_location,
    presentation_notes: input.presentation_notes,
    notes: input.notes,
    photo_url: input.photo_url,
  };

  let tackleId = existingId;
  if (existingId) {
    const { error } = await supabase.from("tackle").update(payload).eq("id", existingId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("tackle").insert(payload).select("id").single();
    if (error) throw error;
    tackleId = data.id;
  }

  await supabase.from("tackle_species").delete().eq("tackle_id", tackleId!);
  if (input.speciesIds.length) {
    const { error } = await supabase
      .from("tackle_species")
      .insert(input.speciesIds.map((sid) => ({ tackle_id: tackleId!, species_id: sid })));
    if (error) throw error;
  }
  return tackleId!;
};

export const deleteTackle = async (item: TackleItem) => {
  await deleteTacklePhoto(item.photo_url);
  const { error } = await supabase.from("tackle").delete().eq("id", item.id);
  if (error) throw error;
};

export interface TackleCatchSummary {
  totalFish: number;
  bySpecies: { species: string; count: number }[];
}

export const fetchTackleCatchSummary = async (tackleId: string): Promise<TackleCatchSummary> => {
  const { data } = await supabase
    .from("catches")
    .select("species, quantity")
    .eq("tackle_id", tackleId);
  const rows = data || [];
  const counts: Record<string, number> = {};
  let total = 0;
  rows.forEach((r) => {
    const q = r.quantity || 1;
    total += q;
    counts[r.species] = (counts[r.species] || 0) + q;
  });
  return {
    totalFish: total,
    bySpecies: Object.entries(counts)
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count),
  };
};
