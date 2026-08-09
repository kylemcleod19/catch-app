import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getStateName } from "@/lib/us-states";
import { ChevronLeft, Loader2, Search, Check, X } from "lucide-react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/lib/googleMaps";

const FLAG_COLORS = ["#3182CE", "#38A169", "#9F7AEA", "#DD6B20", "#319795", "#B83280", "#5A67D8", "#D69E2E"];

interface StationCandidate {
  site_id: string;
  monitoring_location_name: string;
  latitude: number | null;
  longitude: number | null;
  available_params: string[];
  dist?: number;
}

interface StationLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spot: {
    id: string;
    name: string | null;
    body_of_water: string;
    state_code: string;
    site_type: string;
    usgs_site_id: string | null;
    spot_points: { id: string; label: string; latitude: number; longitude: number }[];
  };
  onLinked: () => void;
}

const paramsFromRow = (row: any): string[] => {
  const p: string[] = [];
  if (row?.water_flow) p.push("Flow");
  if (row?.gage_height) p.push("Gage Height");
  if (row?.temp) p.push("Temp");
  if (row?.turbidity) p.push("Turbidity");
  return p;
};

const StationLinkModal = ({ open, onOpenChange, spot, onLinked }: StationLinkModalProps) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<StationCandidate[]>([]);
  const [selected, setSelected] = useState<string | null>(spot.usgs_site_id);
  const [isSatellite, setIsSatellite] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  const ref = spot.spot_points[0];

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    let q = supabase
      .from("usgs_fishing_water_bodies")
      .select("site_id, monitoring_location_name, normalized_water_body, latitude, longitude")
      .eq("state_code", spot.state_code)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (search.trim()) {
      q = q.ilike("monitoring_location_name", `%${search.trim()}%`);
    }

    const { data } = await q.limit(500);
    let rows = (data || []) as any[];

    // Prefer stations on the same body of water when not free-searching
    if (!search.trim()) {
      const sameWater = rows.filter((r) => r.normalized_water_body === spot.body_of_water);
      if (sameWater.length > 0) rows = sameWater;
    }

    const refLat = ref?.latitude ?? 32;
    const refLng = ref?.longitude ?? -97;
    const withDist = rows.map((r) => ({
      ...r,
      dist: Math.sqrt(Math.pow(r.latitude - refLat, 2) + Math.pow(r.longitude - refLng, 2)),
    }));
    withDist.sort((a, b) => a.dist - b.dist);
    const top = withDist.slice(0, 8);

    const { data: avail } = await supabase
      .from("usgs_water_bodies_available_data")
      .select("site_id, water_flow, gage_height, temp, turbidity")
      .in("site_id", top.map((t) => t.site_id));

    const availMap = new Map<string, any>();
    (avail || []).forEach((row: any) => availMap.set(row.site_id, row));

    const requiredKey = spot.site_type === "Lake" ? "gage_height" : "water_flow";
    const enriched: StationCandidate[] = top.map((t) => ({
      site_id: t.site_id,
      monitoring_location_name: t.monitoring_location_name,
      latitude: t.latitude,
      longitude: t.longitude,
      dist: t.dist,
      available_params: paramsFromRow(availMap.get(t.site_id)),
    }));

    // Stations providing the metric this spot needs come first
    enriched.sort((a, b) => {
      const aHas = !!availMap.get(a.site_id)?.[requiredKey];
      const bHas = !!availMap.get(b.site_id)?.[requiredKey];
      if (aHas !== bHas) return aHas ? -1 : 1;
      return (a.dist ?? 0) - (b.dist ?? 0);
    });

    setCandidates(enriched);
    setLoading(false);
  }, [spot.state_code, spot.body_of_water, spot.site_type, ref?.latitude, ref?.longitude]);

  useEffect(() => {
    if (open) {
      setSelected(spot.usgs_site_id);
      load("");
    }
  }, [open, spot.usgs_site_id, load]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await setSpotUsgsSite(spot.id, spot.site_type, selected);
    setSaving(false);

    if (error) {
      toast.error("Failed to link station");
      return;
    }
    toast.success(selected ? "Station linked" : "Station unlinked");
    onLinked();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full w-full h-[100dvh] max-h-[100dvh] z-[60] p-0 border-0 rounded-none [&>button]:hidden overflow-hidden">
        <div className="relative w-full h-full flex flex-col">
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50 safe-area-top">
            <div className="px-3 pt-2 pb-2 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Link Monitoring Station</p>
                <p className="text-xs text-muted-foreground truncate">
                  {spot.name || spot.body_of_water} · {getStateName(spot.state_code)}
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") load(query); }}
                  placeholder="Search stations by name…"
                  className="rounded-xl pl-8 h-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); load(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="flex-1">
            {apiKey ? (
              <StationMap
                apiKey={apiKey}
                mapRef={mapRef}
                spotPin={ref ? { lat: ref.latitude, lng: ref.longitude, label: ref.label } : null}
                candidates={candidates}
                selected={selected}
                onSelect={(id) => setSelected(id === selected ? null : id)}
                isSatellite={isSatellite}
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-sm text-muted-foreground">
                Map unavailable
              </div>
            )}
          </div>

          {/* Bottom panel */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-md border-t border-border/50 safe-area-bottom">
            <div className="px-3 pt-2 pb-3 space-y-2">
              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No stations found.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {candidates.map((loc, idx) => (
                    <button
                      key={loc.site_id}
                      type="button"
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                        selected === loc.site_id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                      }`}
                      onClick={() => setSelected(selected === loc.site_id ? null : loc.site_id)}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: selected === loc.site_id ? "#F59E0B" : FLAG_COLORS[idx % FLAG_COLORS.length] }}
                        >
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{loc.monitoring_location_name}</p>
                          {loc.available_params.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {loc.available_params.map((p) => (
                                <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  {p}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {selected === loc.site_id && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => onOpenChange(false)}>
                  <ChevronLeft className="w-4 h-4" /> Cancel
                </Button>
                <Button
                  variant={isSatellite ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl text-xs px-2.5"
                  onClick={() => setIsSatellite(!isSatellite)}
                >
                  {isSatellite ? "Map" : "Satellite"}
                </Button>
                <Button size="sm" className="rounded-xl gap-1" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {selected ? "Link" : "Unlink"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const StationMap = ({
  apiKey, mapRef, spotPin, candidates, selected, onSelect, isSatellite,
}: {
  apiKey: string;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  spotPin: { lat: number; lng: number; label: string } | null;
  candidates: StationCandidate[];
  selected: string | null;
  onSelect: (id: string) => void;
  isSatellite: boolean;
}) => {
  const { isLoaded } = useGoogleMaps(apiKey);

  useEffect(() => {
    mapRef.current?.setMapTypeId(isSatellite ? "satellite" : "roadmap");
  }, [isSatellite, mapRef]);

  const fitAll = useCallback((map: google.maps.Map) => {
    const bounds = new google.maps.LatLngBounds();
    if (spotPin) bounds.extend({ lat: spotPin.lat, lng: spotPin.lng });
    candidates.forEach((c) => {
      if (c.latitude && c.longitude) bounds.extend({ lat: c.latitude, lng: c.longitude });
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 90);
    else { map.setCenter({ lat: 32.87, lng: -97.34 }); map.setZoom(6); }
  }, [spotPin, candidates]);

  useEffect(() => {
    if (mapRef.current) fitAll(mapRef.current);
  }, [fitAll, mapRef]);

  if (!isLoaded) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      onLoad={(map) => {
        mapRef.current = map;
        map.setMapTypeId(isSatellite ? "satellite" : "roadmap");
        fitAll(map);
      }}
      onUnmount={() => { mapRef.current = null; }}
      options={{ gestureHandling: "greedy", zoomControl: true, mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}
    >
      {spotPin && (
        <Marker
          position={{ lat: spotPin.lat, lng: spotPin.lng }}
          title={spotPin.label}
          zIndex={10}
          icon={{
            url: "data:image/svg+xml," + encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
                <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="#F37920" stroke="#000" stroke-width="2"/>
                <circle cx="16" cy="16" r="5" fill="white"/>
              </svg>`
            ),
            scaledSize: new google.maps.Size(32, 40),
            anchor: new google.maps.Point(16, 40),
          }}
        />
      )}
      {candidates.map((loc, idx) => (
        loc.latitude && loc.longitude ? (
          <Marker
            key={loc.site_id}
            position={{ lat: loc.latitude, lng: loc.longitude }}
            title={`${idx + 1}: ${loc.monitoring_location_name}`}
            zIndex={selected === loc.site_id ? 100 : 50}
            onClick={() => onSelect(loc.site_id)}
            icon={{
              url: "data:image/svg+xml," + encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
                  <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z" fill="${selected === loc.site_id ? "#F59E0B" : FLAG_COLORS[idx % FLAG_COLORS.length]}" stroke="white" stroke-width="2"/>
                  <text x="18" y="22" text-anchor="middle" fill="white" font-size="15" font-weight="bold" font-family="Arial">${idx + 1}</text>
                </svg>`
              ),
              scaledSize: new google.maps.Size(36, 44),
              anchor: new google.maps.Point(18, 44),
            }}
          />
        ) : null
      ))}
    </GoogleMap>
  );
};

export default StationLinkModal;
