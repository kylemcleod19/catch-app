import { Fish } from "lucide-react";
import { TackleItem } from "@/lib/tackleData";

interface Props {
  item: TackleItem;
  onClick: () => void;
}

const TackleCard = ({ item, onClick }: Props) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left bg-card border border-border rounded-2xl overflow-hidden active:scale-[0.98] transition-transform"
  >
    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
      {item.photoSignedUrl ? (
        <img
          src={item.photoSignedUrl}
          alt={`${item.name} — ${item.type}`}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <Fish className="w-8 h-8 text-muted-foreground" />
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

export default TackleCard;
