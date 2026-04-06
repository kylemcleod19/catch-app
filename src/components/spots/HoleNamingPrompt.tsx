import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

const QUICK_LABELS = ["Home Base", "Hole 1", "Hole 2", "Deep pool", "Riffle", "Bank spot", "Under bridge"];

interface HoleNamingPromptProps {
  onConfirm: (label: string) => void;
  onCancel: () => void;
  holeCount: number;
}

const HoleNamingPrompt = ({ onConfirm, onCancel, holeCount }: HoleNamingPromptProps) => {
  const defaultLabel = holeCount === 0 ? "Home Base" : `Hole ${holeCount}`;
  const [label, setLabel] = useState(defaultLabel);

  return (
    <div className="absolute bottom-4 left-4 right-4 z-50 bg-card border border-border rounded-xl p-3 shadow-lg space-y-2">
      <p className="text-sm font-medium text-card-foreground">Name this spot</p>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_LABELS.map((q) => (
          <button
            key={q}
            type="button"
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              label === q
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            onClick={() => setLabel(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Custom name..."
        className="rounded-xl text-sm h-9"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" className="rounded-xl gap-1" onClick={onCancel}>
          <X className="w-3.5 h-3.5" /> Cancel
        </Button>
        <Button type="button" size="sm" className="rounded-xl gap-1" onClick={() => onConfirm(label || defaultLabel)}>
          <Check className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
    </div>
  );
};

export default HoleNamingPrompt;
