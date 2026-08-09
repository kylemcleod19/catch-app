import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { COMMON_SPECIES, Species, fetchSpecies, findOrCreateSpecies, matchesSpeciesQuery } from "@/lib/species";
import { toast } from "sonner";

interface Props {
  value: Species[];
  onChange: (species: Species[]) => void;
}

const SpeciesMultiSelect = ({ value, onChange }: Props) => {
  const { user } = useAuth();
  const [all, setAll] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchSpecies()
      .then(setAll)
      .catch(() => toast.error("Could not load the species list"))
      .finally(() => setLoading(false));
  }, []);

  const selectedIds = useMemo(() => new Set(value.map((s) => s.id)), [value]);

  const results = useMemo(
    () => all.filter((s) => matchesSpeciesQuery(s, query)).slice(0, 40),
    [all, query]
  );

  const suggestions = useMemo(() => {
    const existing = new Set(all.map((s) => s.primary_name.toLowerCase()));
    const q = query.trim().toLowerCase();
    return COMMON_SPECIES.filter(
      (n) => !existing.has(n.toLowerCase()) && (!q || n.toLowerCase().includes(q))
    ).slice(0, 6);
  }, [all, query]);

  const exactExists = all.some((s) => s.primary_name.toLowerCase() === query.trim().toLowerCase());

  const addByName = async (name: string) => {
    if (!user || !name.trim()) return;
    setAdding(true);
    try {
      const sp = await findOrCreateSpecies(name, user.id);
      setAll((prev) => (prev.some((p) => p.id === sp.id) ? prev : [...prev, sp]));
      if (!selectedIds.has(sp.id)) onChange([...value, sp]);
      setQuery("");
    } catch {
      toast.error("Could not add that species");
    } finally {
      setAdding(false);
    }
  };

  const toggle = (s: Species) => {
    if (selectedIds.has(s.id)) onChange(value.filter((v) => v.id !== s.id));
    else onChange([...value, s]);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/30"
            >
              {s.primary_name}
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      <Input
        placeholder="Search species…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="rounded-lg"
      />

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
            >
              <span className="text-foreground">{s.primary_name}</span>
              {selectedIds.has(s.id) && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
          {suggestions.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => addByName(n)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
            >
              <span className="text-muted-foreground">{n}</span>
              <Plus className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
          {results.length === 0 && suggestions.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">No matches yet.</p>
          )}
        </div>
      )}

      {query.trim() && !exactExists && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5 rounded-lg"
          disabled={adding}
          onClick={() => addByName(query)}
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add “{query.trim()}” to the species list
        </Button>
      )}
    </div>
  );
};

export default SpeciesMultiSelect;
