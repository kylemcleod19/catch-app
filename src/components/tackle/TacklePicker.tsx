import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Fish, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { TackleItem, fetchTackle, variantLabel } from "@/lib/tackleData";

interface Props {
  /** Free-text value (kept as fallback / history) */
  value: string;
  tackleId: string | null;
  variantId: string | null;
  /** Species name of the current catch, used to float relevant tackle to the top */
  speciesHint?: string;
  onChange: (next: { text: string; tackleId: string | null; variantId: string | null }) => void;
  placeholder?: string;
}

const TacklePicker = ({ value, tackleId, variantId, speciesHint, onChange, placeholder }: Props) => {
  const { user } = useAuth();
  const [items, setItems] = useState<TackleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  /** Second step: the tackle whose variants we're choosing from */
  const [pending, setPending] = useState<TackleItem | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchTackle(user.id)
      .then(setItems)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [user]);

  const ranked = useMemo(() => {
    const q = value.trim().toLowerCase();
    const scored = items.map((t) => {
      let score = 0;
      if (speciesHint && t.species.some((s) => s.primary_name.toLowerCase() === speciesHint.toLowerCase())) score += 2;
      if (q && t.name.toLowerCase().includes(q)) score += 1;
      return { t, score };
    });
    const filtered = q ? scored.filter((s) => s.t.name.toLowerCase().includes(q) || s.score >= 2) : scored;
    return filtered.sort((a, b) => b.score - a.score).map((s) => s.t);
  }, [items, value, speciesHint]);

  const pick = (t: TackleItem) => {
    if (t.variants.length > 0) {
      setPending(t);
      return;
    }
    onChange({ text: t.name, tackleId: t.id, variantId: null });
    setOpen(false);
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder={placeholder || "Lure / bait used"}
        value={value}
        onChange={(e) => onChange({ text: e.target.value, tackleId: null, variantId: null })}
        className="rounded-lg flex-1"
      />
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPending(null);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="px-3 rounded-lg border border-border bg-card flex items-center gap-1 text-xs font-medium text-muted-foreground min-h-[40px]"
          >
            <Fish className="w-4 h-4" />
            <ChevronDown className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0 bg-popover z-50">
          {pending ? (
            <div>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="text-[11px] font-semibold text-primary"
                >
                  Back
                </button>
                <p className="text-xs font-semibold text-foreground truncate">{pending.name}</p>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {pending.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onChange({
                        text: `${pending.name} — ${variantLabel(v)}`,
                        tackleId: pending.id,
                        variantId: v.id,
                      });
                      setPending(null);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
                  >
                    <div className="w-8 h-8 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                      {v.photoSignedUrl || pending.photoSignedUrl ? (
                        <img
                          src={v.photoSignedUrl || pending.photoSignedUrl!}
                          alt={variantLabel(v)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Fish className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm text-foreground truncate flex-1">{variantLabel(v)}</p>
                    {variantId === v.id && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : ranked.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  Your tackle box is empty. Add flies, lures and bait under Tackle.
                </p>
              ) : (
                ranked.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pick(t)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
                  >
                    <div className="w-8 h-8 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                      {t.photoSignedUrl || t.variants[0]?.photoSignedUrl ? (
                        <img
                          src={(t.variants.find((v) => v.is_primary)?.photoSignedUrl || t.photoSignedUrl || t.variants[0]?.photoSignedUrl)!}
                          alt={t.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Fish className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {t.variants.length > 0 ? `${t.type} · ${t.variants.length} variants` : t.type}
                      </p>
                    </div>
                    {t.variants.length > 0 ? (
                      <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground" />
                    ) : (
                      tackleId === t.id && <Check className="w-4 h-4 text-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default TacklePicker;
