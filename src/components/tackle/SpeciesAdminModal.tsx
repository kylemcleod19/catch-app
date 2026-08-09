import { useEffect, useState } from "react";
import { Loader2, Merge, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Species, fetchSpecies, matchesSpeciesQuery } from "@/lib/species";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Admin-only tool for consolidating duplicate species entries. */
const SpeciesAdminModal = ({ open, onOpenChange }: Props) => {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const load = () => {
    setLoading(true);
    fetchSpecies()
      .then(setSpecies)
      .catch(() => toast.error("Could not load species"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) {
      setSourceId(null);
      setTargetId(null);
      load();
    }
  }, [open]);

  const merge = async () => {
    if (!sourceId || !targetId) return;
    setMerging(true);
    try {
      const { error } = await supabase.functions.invoke("merge-species", {
        body: { source_id: sourceId, target_id: targetId },
      });
      if (error) throw error;
      toast.success("Species merged");
      setSourceId(null);
      setTargetId(null);
      load();
    } catch {
      toast.error("Merge failed");
    } finally {
      setMerging(false);
    }
  };

  const list = species.filter((s) => matchesSpeciesQuery(s, query));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[90svh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Manage species</h2>
          <button type="button" onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto min-h-0">
          <p className="text-xs text-muted-foreground">
            Pick a duplicate, then pick the entry to keep. The duplicate's name becomes a nickname and every catch and
            tackle link is moved over.
          </p>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search species" className="rounded-lg" />

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              {list.map((s) => {
                const isSource = sourceId === s.id;
                const isTarget = targetId === s.id;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{s.primary_name}</p>
                      {s.nicknames?.length > 0 && (
                        <p className="text-[11px] text-muted-foreground truncate">aka {s.nicknames.join(", ")}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSourceId(isSource ? null : s.id)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold border ${
                          isSource ? "bg-destructive text-destructive-foreground border-destructive" : "border-border text-muted-foreground"
                        }`}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetId(isTarget ? null : s.id)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold border ${
                          isTarget ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                        }`}
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                );
              })}
              {list.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No species found.</p>}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border safe-area-bottom-action">
          <Button
            type="button"
            variant="catch"
            size="lg"
            className="w-full gap-1.5"
            disabled={!sourceId || !targetId || sourceId === targetId || merging}
            onClick={merge}
          >
            {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
            Merge into kept species
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SpeciesAdminModal;
