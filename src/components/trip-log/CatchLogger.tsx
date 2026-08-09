import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { Plus, X, Fish, Minus, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import TacklePicker from "@/components/tackle/TacklePicker";
import { findOrCreateSpecies } from "@/lib/species";

interface CatchRow {
  id: string;
  species: string;
  weight_oz: number | null;
  length_in: number | null;
  lure_or_bait: string | null;
  notes: string | null;
  quantity: number;
  tackle_id: string | null;
}

export interface BulkCatch {
  species: string;
  quantity: number;
  lure_or_bait?: string | null;
  weight_oz?: number | null;
  length_in?: number | null;
}

export interface CatchLoggerHandle {
  addBulkCatches: (catches: BulkCatch[]) => Promise<void>;
}

interface CatchLoggerProps {
  tripId: string;
  userId: string;
}

interface NewCatchForm {
  species: string;
  weightOz: string;
  lengthIn: string;
  lureOrBait: string;
  tackleId: string | null;
  notes: string;
}

const emptyForm = (): NewCatchForm => ({
  species: "",
  weightOz: "",
  lengthIn: "",
  lureOrBait: "",
  tackleId: null,
  notes: "",
});

const CatchLogger = forwardRef<CatchLoggerHandle, CatchLoggerProps>(({ tripId, userId }, ref) => {
  const [catches, setCatches] = useState<CatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewCatchForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchCatches = async () => {
    const { data } = await supabase
      .from("catches")
      .select("id, species, weight_oz, length_in, lure_or_bait, notes, quantity, tackle_id")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });
    setCatches((data as CatchRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCatches();
  }, [tripId]);

  useImperativeHandle(ref, () => ({
    addBulkCatches: async (bulkCatches: BulkCatch[]) => {
      const rows = await Promise.all(bulkCatches.map(async (c) => ({
        user_id: userId,
        trip_id: tripId,
        species: c.species,
        species_id: await findOrCreateSpecies(c.species, userId).then((s) => s.id).catch(() => null),
        quantity: c.quantity || 1,
        lure_or_bait: c.lure_or_bait || null,
        weight_oz: c.weight_oz ?? null,
        length_in: c.length_in ?? null,
      })));

      const { error } = await supabase.from("catches").insert(rows as any);
      if (error) {
        toast.error("Failed to save catches from voice input");
      } else {
        toast.success(`${bulkCatches.length} catch${bulkCatches.length > 1 ? "es" : ""} added from voice!`);
        await fetchCatches();
      }
    },
  }));

  const handleSaveCatch = async () => {
    if (!form.species.trim()) {
      toast.error("Species is required");
      return;
    }
    setSaving(true);
    let speciesId: string | null = null;
    try {
      speciesId = (await findOrCreateSpecies(form.species, userId)).id;
    } catch {
      speciesId = null;
    }
    const { error } = await supabase.from("catches").insert({
      user_id: userId,
      trip_id: tripId,
      species: form.species.trim(),
      species_id: speciesId,
      tackle_id: form.tackleId,
      weight_oz: form.weightOz ? parseFloat(form.weightOz) : null,
      length_in: form.lengthIn ? parseFloat(form.lengthIn) : null,
      lure_or_bait: form.lureOrBait || null,
      notes: form.notes || null,
      quantity: 1,
    } as any);

    if (error) {
      toast.error("Failed to save catch");
    } else {
      toast.success("Catch saved!");
      setForm(emptyForm());
      setShowForm(false);
      await fetchCatches();
    }
    setSaving(false);
  };

  const updateQuantity = async (id: string, delta: number) => {
    const c = catches.find((x) => x.id === id);
    if (!c) return;
    const newQty = Math.max(1, c.quantity + delta);
    setUpdatingId(id);
    const { error } = await supabase
      .from("catches")
      .update({ quantity: newQty } as any)
      .eq("id", id);
    if (!error) {
      setCatches((prev) => prev.map((x) => (x.id === id ? { ...x, quantity: newQty } : x)));
    }
    setUpdatingId(null);
  };

  const deleteCatch = async (id: string) => {
    const { error } = await supabase.from("catches").delete().eq("id", id);
    if (!error) {
      setCatches((prev) => prev.filter((x) => x.id !== id));
      toast.success("Catch removed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Catches</label>
        <Button type="button" variant="ghost" size="sm" className="gap-1 text-primary" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Add catch
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : catches.length === 0 && !showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full py-8 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Fish className="w-6 h-6" />
          <span className="text-sm font-medium">Tap to log your first catch</span>
        </button>
      ) : null}

      {/* Saved catches */}
      {catches.map((c) => (
        <div key={c.id} className="p-3 bg-card rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm text-card-foreground">{c.species}</span>
              {(c.weight_oz || c.length_in) && (
                <span className="text-xs text-muted-foreground ml-2">
                  {c.weight_oz ? `${c.weight_oz}oz` : ""}{c.weight_oz && c.length_in ? " · " : ""}{c.length_in ? `${c.length_in}in` : ""}
                </span>
              )}
              {c.lure_or_bait && <span className="text-xs text-muted-foreground ml-2">• {c.lure_or_bait}</span>}
            </div>
            <button type="button" onClick={() => deleteCatch(c.id)} className="text-muted-foreground hover:text-destructive p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Qty:</span>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => updateQuantity(c.id, -1)} disabled={c.quantity <= 1 || updatingId === c.id}>
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-sm font-semibold text-foreground w-6 text-center">
              {updatingId === c.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : c.quantity}
            </span>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-lg" onClick={() => updateQuantity(c.id, 1)} disabled={updatingId === c.id}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ))}

      {/* New catch form */}
      {showForm && (
        <div className="p-3 bg-card rounded-xl border border-primary/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">New Catch</span>
            <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm()); }} className="text-muted-foreground hover:text-destructive">
              <X className="w-4 h-4" />
            </button>
          </div>
          <Input placeholder="Species (e.g. Largemouth Bass)" value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} className="rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Weight (oz)" type="number" value={form.weightOz} onChange={(e) => setForm({ ...form, weightOz: e.target.value })} className="rounded-lg" />
            <Input placeholder="Length (in)" type="number" value={form.lengthIn} onChange={(e) => setForm({ ...form, lengthIn: e.target.value })} className="rounded-lg" />
          </div>
          <TacklePicker
            value={form.lureOrBait}
            tackleId={form.tackleId}
            speciesHint={form.species}
            onChange={({ text, tackleId }) => setForm({ ...form, lureOrBait: text, tackleId })}
          />
          <Input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-lg" />
          <Button type="button" variant="catch" size="sm" className="w-full gap-1.5" onClick={handleSaveCatch} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Catch
          </Button>
        </div>
      )}
    </div>
  );
});

CatchLogger.displayName = "CatchLogger";

export default CatchLogger;
