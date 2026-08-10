import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Fish } from "lucide-react";
import { TackleItem, variantLabel } from "@/lib/tackleData";

interface Props {
  item: TackleItem;
  onClick: () => void;
}

const TackleCard = ({ item, onClick }: Props) => {
  const slides = useMemo(() => {
    const fromVariants = item.variants
      .filter((v) => v.photoSignedUrl)
      .map((v) => ({ url: v.photoSignedUrl!, label: variantLabel(v) }));
    const primaryFirst = [
      ...fromVariants.filter((_, i) => item.variants.filter((v) => v.photoSignedUrl)[i]?.is_primary),
      ...fromVariants.filter((_, i) => !item.variants.filter((v) => v.photoSignedUrl)[i]?.is_primary),
    ];
    if (primaryFirst.length) return primaryFirst;
    return item.photoSignedUrl ? [{ url: item.photoSignedUrl, label: "" }] : [];
  }, [item]);

  const [index, setIndex] = useState(0);
  const active = slides[Math.min(index, slides.length - 1)];

  const step = (e: React.MouseEvent, delta: number) => {
    e.stopPropagation();
    setIndex((i) => (i + delta + slides.length) % slides.length);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-card border border-border rounded-2xl overflow-hidden active:scale-[0.98] transition-transform"
    >
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden relative">
        {active ? (
          <img
            src={active.url}
            alt={`${item.name}${active.label ? ` — ${active.label}` : ""} — ${item.type}`}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <Fish className="w-8 h-8 text-muted-foreground" />
        )}

        {slides.length > 1 && (
          <>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => step(e, -1)}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background/80 flex items-center justify-center"
              aria-label="Previous variant photo"
            >
              <ChevronLeft className="w-4 h-4 text-foreground" />
            </span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => step(e, 1)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background/80 flex items-center justify-center"
              aria-label="Next variant photo"
            >
              <ChevronRight className="w-4 h-4 text-foreground" />
            </span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
              {slides.map((s, i) => (
                <span
                  key={s.url}
                  className={`w-1.5 h-1.5 rounded-full ${i === index ? "bg-primary" : "bg-background/70"}`}
                />
              ))}
            </span>
          </>
        )}

        {active?.label && (
          <span className="absolute top-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-background/85 text-foreground">
            {active.label}
          </span>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <p className="text-sm font-semibold text-card-foreground leading-tight line-clamp-2">{item.name}</p>
        <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          {item.type}
        </span>
        {item.species.length > 0 && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">
            {item.species.map((s) => s.primary_name).join(", ")}
          </p>
        )}
      </div>
    </button>
  );
};

export default TackleCard;
