import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SpeciesMultiSelect from "./SpeciesMultiSelect";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Species, findOrCreateSpecies } from "@/lib/species";
import {
  TACKLE_TYPES,
  TackleItem,
  deleteTackle,
  saveTackle,
  signPhoto,
  uploadTacklePhoto,
} from "@/lib/tackleData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: TackleItem | null;
  onSaved: () => void;
}

const TackleFormModal = ({ open, onOpenChange, item, onSaved }: Props) => {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Fly");
  const [purchaseLocation, setPurchaseLocation] = useState("");
  const [presentation, setPresentation] = useState("");
  const [notes, setNotes] = useState("");
  const [species, setSpecies] = useState<Species[]>([]);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [aiGuess, setAiGuess] = useState<any>(null);
  const [clarifications, setClarifications] = useState<string[]>([]);
  const [clarifyInput, setClarifyInput] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(item?.name || "");
    setType(item?.type || "Fly");
    setPurchaseLocation(item?.purchase_location || "");
    setPresentation(item?.presentation_notes || "");
    setNotes(item?.notes || "");
    setSpecies(item?.species || []);
    setPhotoPath(item?.photo_url || null);
    setPhotoPreview(item?.photoSignedUrl || null);
    setConfirmDelete(false);
    setAiGuess(null);
    setClarifications([]);
    setClarifyInput("");
  }, [open, item]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const path = await uploadTacklePhoto(file, user.id);
      setPhotoPath(path);
      setPhotoPreview(await signPhoto(path));
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runIdentify = async (notes: string[]) => {
    if (!photoPreview || !user) return;
    setIdentifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("identify-tackle", {
        body: { image_url: photoPreview, clarifications: notes, previous: aiGuess },
      });
      if (error) throw error;

      if (data?.type && TACKLE_TYPES.includes(data.type)) setType(data.type);
      if (data?.suggested_name) setName(data.suggested_name);
      if (data?.presentation_hint) setPresentation(data.presentation_hint);

      if (Array.isArray(data?.species) && data.species.length) {
        const resolved: Species[] = [];
        for (const s of data.species.slice(0, 6)) {
          try {
            resolved.push(await findOrCreateSpecies(String(s), user.id));
          } catch {
            /* skip */
          }
        }
        setSpecies((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...resolved.filter((r) => !ids.has(r.id))];
        });
      }
      setAiGuess(data || null);
      setClarifications(notes);
      toast.success("Suggestions filled in — edit anything or clarify below");
    } catch {
      toast.error("Could not identify the photo. Fill the details in manually.");
    } finally {
      setIdentifying(false);
    }
  };

  const identify = () => runIdentify([]);

  const sendClarification = () => {
    const note = clarifyInput.trim();
    if (!note) return;
    setClarifyInput("");
    runIdentify([...clarifications, note]);
  };


  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error("Give this tackle a name");
      return;
    }
    setSaving(true);
    try {
      await saveTackle(
        user.id,
        {
          name,
          type,
          purchase_location: purchaseLocation.trim() || null,
          presentation_notes: presentation.trim() || null,
          notes: notes.trim() || null,
          photo_url: photoPath,
          speciesIds: species.map((s) => s.id),
        },
        item?.id
      );
      toast.success(item ? "Tackle updated" : "Tackle added");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Could not save this tackle");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await deleteTackle(item);
      toast.success("Tackle removed");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Could not remove this tackle");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[90svh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-bold text-foreground">{item ? "Edit tackle" : "Add tackle"}</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Photo */}
          <div className="space-y-2">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              {photoPreview ? (
                <img src={photoPreview} alt={name || "Tackle photo"} className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-muted-foreground" />
              )}
              {uploading && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhoto}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="rounded-xl gap-1.5" onClick={() => fileRef.current?.click()}>
                <Camera className="w-4 h-4" /> {photoPreview ? "Replace photo" : "Add photo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl gap-1.5 border-primary/40 text-primary"
                disabled={!photoPreview || identifying}
                onClick={identify}
              >
                {identifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Identify with AI
              </Button>
            </div>

            {aiGuess && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">AI guess</p>
                {aiGuess.reasoning && <p className="text-sm text-foreground">{aiGuess.reasoning}</p>}
                {clarifications.length > 0 && (
                  <ul className="space-y-1">
                    {clarifications.map((c, i) => (
                      <li key={i} className="text-xs text-muted-foreground">You: {c}</li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Input
                    value={clarifyInput}
                    onChange={(e) => setClarifyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendClarification();
                      }
                    }}
                    placeholder="Not quite — it's a size 14 caddis…"
                    className="rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-lg shrink-0"
                    disabled={identifying || !clarifyInput.trim()}
                    onClick={sendClarification}
                  >
                    {identifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refine"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Olive Woolly Bugger #10" className="rounded-lg" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {TACKLE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Target species</label>
            <SpeciesMultiSelect value={species} onChange={setSpecies} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Purchase location</label>
            <Input
              value={purchaseLocation}
              onChange={(e) => setPurchaseLocation(e.target.value)}
              placeholder="Shop, website, or where you got it"
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Presentation notes</label>
            <Textarea
              value={presentation}
              onChange={(e) => setPresentation(e.target.value)}
              placeholder="How to fish it — depth, retrieve, drift, conditions…"
              className="rounded-lg min-h-[80px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth remembering"
              className="rounded-lg min-h-[60px]"
            />
          </div>

          {item && (
            <div className="pt-2">
              {confirmDelete ? (
                <div className="flex gap-2">
                  <Button type="button" variant="destructive" className="flex-1 rounded-xl" onClick={handleDelete} disabled={saving}>
                    Confirm delete
                  </Button>
                  <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-xl gap-1.5 text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="w-4 h-4" /> Delete tackle
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border safe-area-bottom-action">
          <Button type="button" variant="catch" size="lg" className="w-full" onClick={handleSave} disabled={saving || uploading}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {item ? "Save changes" : "Add to tackle box"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TackleFormModal;
