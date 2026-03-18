import { useState } from "react";
import { Plus, X, Fish } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CatchEntry {
  id: string;
  species: string;
  weightOz: string;
  lengthIn: string;
  lureOrBait: string;
  notes: string;
}

interface CatchLoggerProps {
  catches: CatchEntry[];
  onCatchesChange: (catches: CatchEntry[]) => void;
}

const emptyCatch = (): CatchEntry => ({
  id: crypto.randomUUID(),
  species: "",
  weightOz: "",
  lengthIn: "",
  lureOrBait: "",
  notes: "",
});

const CatchLogger = ({ catches, onCatchesChange }: CatchLoggerProps) => {
  const addCatch = () => onCatchesChange([...catches, emptyCatch()]);
  const removeCatch = (id: string) => onCatchesChange(catches.filter((c) => c.id !== id));
  const updateCatch = (id: string, field: keyof CatchEntry, value: string) =>
    onCatchesChange(catches.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Catches</label>
        <Button type="button" variant="ghost" size="sm" className="gap-1 text-primary" onClick={addCatch}>
          <Plus className="w-4 h-4" /> Add catch
        </Button>
      </div>

      {catches.length === 0 && (
        <button
          type="button"
          onClick={addCatch}
          className="w-full py-8 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Fish className="w-6 h-6" />
          <span className="text-sm font-medium">Tap to log your first catch</span>
        </button>
      )}

      {catches.map((c, i) => (
        <div key={c.id} className="p-3 bg-card rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Catch #{i + 1}</span>
            <button type="button" onClick={() => removeCatch(c.id)} className="text-muted-foreground hover:text-destructive">
              <X className="w-4 h-4" />
            </button>
          </div>
          <Input placeholder="Species (e.g. Largemouth Bass)" value={c.species} onChange={(e) => updateCatch(c.id, "species", e.target.value)} className="rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Weight (oz)" type="number" value={c.weightOz} onChange={(e) => updateCatch(c.id, "weightOz", e.target.value)} className="rounded-lg" />
            <Input placeholder="Length (in)" type="number" value={c.lengthIn} onChange={(e) => updateCatch(c.id, "lengthIn", e.target.value)} className="rounded-lg" />
          </div>
          <Input placeholder="Lure / Bait used" value={c.lureOrBait} onChange={(e) => updateCatch(c.id, "lureOrBait", e.target.value)} className="rounded-lg" />
          <Input placeholder="Notes (optional)" value={c.notes} onChange={(e) => updateCatch(c.id, "notes", e.target.value)} className="rounded-lg" />
        </div>
      ))}
    </div>
  );
};

export default CatchLogger;
