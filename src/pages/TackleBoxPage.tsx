import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Shield } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TackleCard from "@/components/tackle/TackleCard";
import TackleFormModal from "@/components/tackle/TackleFormModal";
import TackleDetailModal from "@/components/tackle/TackleDetailModal";
import SpeciesAdminModal from "@/components/tackle/SpeciesAdminModal";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TackleCategory, TackleItem, fetchTackle, fetchTackleTaxonomy } from "@/lib/tackleData";
import { toast } from "sonner";

const TackleBoxPage = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<TackleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [taxonomy, setTaxonomy] = useState<TackleCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [speciesFilter, setSpeciesFilter] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [active, setActive] = useState<TackleItem | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await fetchTackle(user.id));
    } catch {
      toast.error("Could not load your tackle box");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (user) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle()
        .then(({ data }) => setIsAdmin(!!data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const speciesOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.species.forEach((s) => set.add(s.primary_name)));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (typeFilter && i.type !== typeFilter) return false;
        if (speciesFilter && !i.species.some((s) => s.primary_name === speciesFilter)) return false;
        if (query.trim() && !i.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
        return true;
      }),
    [items, typeFilter, speciesFilter, query]
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-4 pt-safe">
        <div className="flex items-center justify-between pt-4 pb-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Tackle Box</h1>
            <p className="text-sm text-muted-foreground">Flies, lures and bait — and how to fish them</p>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setAdminOpen(true)} aria-label="Manage species">
                <Shield className="w-5 h-5" />
              </Button>
            )}
            <Button
              variant="catch"
              size="icon"
              className="rounded-xl h-11 w-11"
              onClick={() => {
                setActive(null);
                setFormOpen(true);
              }}
              aria-label="Add tackle"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="relative mt-2">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tackle by name"
            className="pl-9 rounded-xl"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto py-3 -mx-4 px-4">
          {[null, ...TACKLE_TYPES].map((t) => (
            <button
              key={t ?? "all"}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border"
              }`}
            >
              {t ?? "All"}
            </button>
          ))}
        </div>

        {speciesOptions.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-4 px-4">
            {[null, ...speciesOptions].map((s) => (
              <button
                key={s ?? "all-species"}
                type="button"
                onClick={() => setSpeciesFilter(s)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  speciesFilter === s
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-muted-foreground border-border"
                }`}
              >
                {s ?? "Any species"}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="px-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              setActive(null);
              setFormOpen(true);
            }}
            className="w-full py-14 border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Plus className="w-7 h-7" />
            <span className="text-sm font-medium">
              {items.length === 0 ? "Add your first fly, lure or bait" : "No tackle matches those filters"}
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((item) => (
              <TackleCard
                key={item.id}
                item={item}
                onClick={() => {
                  setActive(item);
                  setDetailOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </main>

      <TackleFormModal open={formOpen} onOpenChange={setFormOpen} item={active} onSaved={load} />
      <TackleDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        item={active}
        onEdit={() => {
          setDetailOpen(false);
          setFormOpen(true);
        }}
      />
      <SpeciesAdminModal open={adminOpen} onOpenChange={setAdminOpen} />

      <BottomNav />
    </div>
  );
};

export default TackleBoxPage;
