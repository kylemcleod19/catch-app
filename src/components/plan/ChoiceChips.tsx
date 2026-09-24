import { Check } from "lucide-react";

interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
}

/** Tap-to-pick buttons; multi-select by default. */
const ChoiceChips = ({ options, selected, onChange, multi = true }: Props) => (
  <div className="flex flex-wrap gap-2">
    {options.map((o) => {
      const on = selected.includes(o);
      return (
        <button
          key={o}
          type="button"
          onClick={() =>
            onChange(multi ? (on ? selected.filter((x) => x !== o) : [...selected, o]) : on ? [] : [o])
          }
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1 ${
            on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"
          }`}
        >
          {on && <Check className="w-3.5 h-3.5" />}
          {o}
        </button>
      );
    })}
  </div>
);

export default ChoiceChips;
