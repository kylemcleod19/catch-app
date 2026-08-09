import { useEffect, useState } from "react";
import { Fish, Loader2, MapPin, Pencil, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TackleCatchSummary, TackleItem, fetchTackleCatchSummary } from "@/lib/tackleData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: TackleItem | null;
  onEdit: () => void;
}

const TackleDetailModal = ({ open, onOpenChange, item, onEdit }: Props) => {
  const [summary, setSummary] = useState<TackleCatchSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setLoading(true);
    fetchTackleCatchSummary(item.id)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [open, item]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[90svh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-bold text-foreground truncate pr-2">{item.name}</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted">
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
            <button type="button" onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-muted">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="w-full aspect-video bg-muted flex items-center justify-center overflow-hidden">
            {item.photoSignedUrl ? (
              <img src={item.photoSignedUrl} alt={`${item.name} — ${item.type}`} className="w-full h-full object-cover" />
            ) : (
              <Fish className="w-10 h-10 text-muted-foreground" />
            )}
          </div>

          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-primary/10 text-primary">
                {item.type}
              </span>
              {item.species.map((s) => (
                <span key={s.id} className="text-[10px] font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {s.primary_name}
                </span>
              ))}
            </div>

            {item.presentation_notes && (
              <section className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">How to present it</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap">{item.presentation_notes}</p>
              </section>
            )}

            {item.purchase_location && (
              <section className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                {item.purchase_location}
              </section>
            )}

            {item.notes && (
              <section className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap">{item.notes}</p>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Catches on this tackle</h3>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : summary && summary.totalFish > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-2xl font-bold text-foreground">
                    {summary.totalFish} <span className="text-sm font-medium text-muted-foreground">fish landed</span>
                  </p>
                  {summary.bySpecies.map((s) => (
                    <div key={s.species} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{s.species}</span>
                      <span className="text-muted-foreground font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No catches logged on this one yet.</p>
              )}
            </section>
          </div>
        </div>

        <div className="p-4 border-t border-border safe-area-bottom-action">
          <Button type="button" variant="outline" className="w-full rounded-xl gap-1.5" onClick={onEdit}>
            <Pencil className="w-4 h-4" /> Edit tackle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TackleDetailModal;
