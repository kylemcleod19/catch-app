import { useRef, useState } from "react";
import { Camera, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { signPhoto, uploadTacklePhoto } from "@/lib/tackleData";
import { toast } from "sonner";

export interface DraftVariant {
  key: string;
  id?: string;
  color: string;
  size: string;
  photo_url: string | null;
  photoPreview: string | null;
  notes: string;
  is_primary: boolean;
}

export const newDraftVariant = (primary = false): DraftVariant => ({
  key: crypto.randomUUID(),
  color: "",
  size: "",
  photo_url: null,
  photoPreview: null,
  notes: "",
  is_primary: primary,
});

interface Props {
  variants: DraftVariant[];
  onChange: (next: DraftVariant[]) => void;
}

const VariantEditor = ({ variants, onChange }: Props) => {
  const { user } = useAuth();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const patch = (key: string, changes: Partial<DraftVariant>) =>
    onChange(variants.map((v) => (v.key === key ? { ...v, ...changes } : v)));

  const add = () => {
    const first = variants.length === 0;
    onChange([...variants, newDraftVariant(first)]);
  };

  const remove = (key: string) => {
    const next = variants.filter((v) => v.key !== key);
    if (next.length && !next.some((v) => v.is_primary)) next[0].is_primary = true;
    onChange(next);
  };

  const setPrimary = (key: string) =>
    onChange(variants.map((v) => ({ ...v, is_primary: v.key === key })));

  const handlePhoto = async (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file || !user) return;
    setUploadingKey(key);
    try {
      const path = await uploadTacklePhoto(file, user.id);
      patch(key, { photo_url: path, photoPreview: await signPhoto(path) });
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploadingKey(null);
      input.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {variants.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No variants yet. Add one for each colour or size you carry — e.g. Black, size 10.
        </p>
      )}

      {variants.map((v) => (
        <div key={v.key} className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRefs.current[v.key]?.click()}
              className="w-16 h-16 shrink-0 rounded-lg bg-muted overflow-hidden flex items-center justify-center relative"
              aria-label="Add variant photo"
            >
              {v.photoPreview ? (
                <img src={v.photoPreview} alt={`${v.color} ${v.size}`.trim()} className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-5 h-5 text-muted-foreground" />
              )}
              {uploadingKey === v.key && (
                <span className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </span>
              )}
            </button>
            <input
              ref={(el) => (fileRefs.current[v.key] = el)}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePhoto(v.key, e)}
            />

            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                value={v.color}
                onChange={(e) => patch(v.key, { color: e.target.value })}
                placeholder="Colour"
                className="rounded-lg"
              />
              <Input
                value={v.size}
                onChange={(e) => patch(v.key, { size: e.target.value })}
                placeholder="Size"
                className="rounded-lg"
              />
            </div>
          </div>

          <Textarea
            value={v.notes}
            onChange={(e) => patch(v.key, { notes: e.target.value })}
            placeholder="Notes for this variant (optional)"
            className="rounded-lg min-h-[48px]"
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPrimary(v.key)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1.5 rounded-lg ${
                v.is_primary ? "text-primary bg-primary/10" : "text-muted-foreground"
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${v.is_primary ? "fill-current" : ""}`} />
              {v.is_primary ? "Main photo" : "Make main"}
            </button>
            <button
              type="button"
              onClick={() => remove(v.key)}
              className="p-2 text-muted-foreground hover:text-destructive"
              aria-label="Remove variant"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" className="w-full rounded-xl gap-1.5" onClick={add}>
        <Plus className="w-4 h-4" /> Add variant
      </Button>
    </div>
  );
};

export default VariantEditor;
