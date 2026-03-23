import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useHomeState } from "@/hooks/useHomeState";
import { toast } from "sonner";
import { US_STATES, getStateName } from "@/lib/us-states";
import { ChevronLeft, ChevronRight, Loader2, MapPin, Plus, X, Search, Navigation } from "lucide-react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

interface SpotPoint {
  label: string;
  latitude: number;
  longitude: number;
}

export interface CreatedSpot {
  id: string;
  name: string | null;
  body_of_water: string;
  state_code: string;
  site_type: string;
  points: SpotPoint[];
}

interface UsgsLocation {
  site_id: string;
  monitoring_location_name: string;
  latitude: number | null;
  longitude: number | null;
}

interface SpotCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpotCreated: (spot: CreatedSpot) => void;
  initialStateCode?: string;
}

type Step = "state" | "water" | "usgs" | "coordinates";

const mapContainerStyle = { width: "100%", height: "260px", borderRadius: "0.75rem" };

const SpotCreationModal = ({ open, onOpenChange, onSpotCreated, initialStateCode }: SpotCreationModalProps) => {
  const { user } = useAuth();
  const { homeState, updateHomeState } = useHomeState();
  const [step, setStep] = useState<Step>("state");
  const [saving, setSaving] = useState(false);

  // Step 1: State
  const [stateCode, setStateCode] = useState(initialStateCode ?? "");
  const [saveAsHome, setSaveAsHome] = useState(false);

  // Step 2: Water body
  const [siteType, setSiteType] = useState<"Stream" | "Lake, Reservoir, Impoundment">("Stream");
  const [waterBodies, setWaterBodies] = useState<string[]>([]);
  const [loadingWater, setLoadingWater] = useState(false);
  const [selectedWater, setSelectedWater] = useState("");
  const [customWater, setCustomWater] = useState("");
  const [waterSearch, setWaterSearch] = useState("");

  // Step 2.5: USGS location selection
  const [usgsLocations, setUsgsLocations] = useState<UsgsLocation[]>([]);
  const [loadingUsgs, setLoadingUsgs] = useState(false);
  const [selectedUsgs, setSelectedUsgs] = useState<UsgsLocation | null>(null);

  // Step 3: Coordinates
  const [spotName, setSpotName] = useState("");
  const [points, setPoints] = useState<SpotPoint[]>([]);
  const [newLabel, setNewLabel] = useState("Fishing spot");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  // Fetch Google Maps API key
  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  // Fetch water bodies using RPC (no row limit)
  useEffect(() => {
    if (!stateCode) return;
    setLoadingWater(true);
    setSelectedWater("");
    setWaterSearch("");
    supabase
      .rpc("get_distinct_water_bodies", { _state_code: stateCode, _site_type: siteType })
      .then(({ data }) => {
        const bodies = (data || []).map((d: any) => d.normalized_water_body as string).filter(Boolean);
        setWaterBodies(bodies);
        setLoadingWater(false);
      });
  }, [stateCode, siteType]);

  // Reset on open
  useEffect(() => {
    if (open) {
      const defaultState = initialStateCode ?? homeState ?? "";
      setStep(defaultState ? "water" : "state");
      setStateCode(defaultState);
      setSiteType("Stream");
      setSelectedWater("");
      setCustomWater("");
      setPoints([]);
      setSpotName("");
      setNewLabel("Fishing spot");
      setMapCenter(null);
      setSaveAsHome(false);
      setSelectedUsgs(null);
      setUsgsLocations([]);
    }
  }, [open, initialStateCode, homeState]);

  const effectiveWater = customWater.trim() || selectedWater;

  // Fetch USGS locations for selected water body
  const fetchUsgsLocations = useCallback(async () => {
    if (!effectiveWater || !stateCode) return;
    setLoadingUsgs(true);
    const { data } = await supabase
      .from("usgs_monitoring_locations")
      .select("site_id, monitoring_location_name, latitude, longitude")
      .eq("state_code", stateCode)
      .eq("normalized_water_body", effectiveWater)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("monitoring_location_name");
    setUsgsLocations((data as UsgsLocation[]) || []);
    setLoadingUsgs(false);
  }, [effectiveWater, stateCode]);

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        setPoints((prev) => [
          ...prev,
          { label: newLabel || "Pin", latitude: e.latLng!.lat(), longitude: e.latLng!.lng() },
        ]);
        setNewLabel("Fishing spot");
      }
    },
    [newLabel]
  );

  const removePoint = (idx: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapRef.current?.panTo(loc);
        mapRef.current?.setZoom(13);
      },
      () => {}
    );
  };

  const handleNextToUsgs = async () => {
    if (saveAsHome && stateCode) {
      await updateHomeState(stateCode);
    }
    await fetchUsgsLocations();
    setStep("usgs");
  };

  const handleSave = async () => {
    if (!user || !effectiveWater || !stateCode) return;
    setSaving(true);
    try {
      const { data: spot, error } = await supabase
        .from("spots")
        .insert({
          user_id: user.id,
          name: spotName || null,
          body_of_water: effectiveWater,
          state_code: stateCode,
          site_type: siteType === "Lake, Reservoir, Impoundment" ? "Lake" : "Stream",
          usgs_site_id: selectedUsgs?.site_id || null,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      if (points.length > 0) {
        const { error: ptErr } = await supabase.from("spot_points").insert(
          points.map((p) => ({
            spot_id: spot.id,
            label: p.label,
            latitude: p.latitude,
            longitude: p.longitude,
          })) as any
        );
        if (ptErr) throw ptErr;
      }

      toast.success("Spot created!");
      onSpotCreated({
        id: spot.id,
        name: spotName || null,
        body_of_water: effectiveWater,
        state_code: stateCode,
        site_type: siteType === "Lake, Reservoir, Impoundment" ? "Lake" : "Stream",
        points,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create spot");
    } finally {
      setSaving(false);
    }
  };

  const filteredWaterBodies = waterSearch
    ? waterBodies.filter((w) => w.toLowerCase().includes(waterSearch.toLowerCase()))
    : waterBodies;

  const hasUsgsData = waterBodies.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {step === "state" && "Select State"}
            {step === "water" && "Select Body of Water"}
            {step === "usgs" && "Link USGS Location"}
            {step === "coordinates" && "Mark Locations"}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: State */}
        {step === "state" && (
          <div className="space-y-4">
            <Select value={stateCode} onValueChange={setStateCode}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Choose a state" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {US_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {stateCode && stateCode !== homeState && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox checked={saveAsHome} onCheckedChange={(v) => setSaveAsHome(!!v)} />
                Set as my home state
              </label>
            )}
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (saveAsHome && stateCode) updateHomeState(stateCode);
                  setStep("water");
                }}
                disabled={!stateCode}
                className="rounded-xl gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Body of Water */}
        {step === "water" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={siteType === "Stream" ? "default" : "outline"}
                size="sm"
                className="rounded-xl flex-1"
                onClick={() => setSiteType("Stream")}
              >
                Stream / River
              </Button>
              <Button
                type="button"
                variant={siteType === "Lake, Reservoir, Impoundment" ? "default" : "outline"}
                size="sm"
                className="rounded-xl flex-1"
                onClick={() => setSiteType("Lake, Reservoir, Impoundment")}
              >
                Lake
              </Button>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Name of water body</label>
              <Input
                placeholder="e.g. Brushy Creek, My Private Pond"
                value={customWater}
                onChange={(e) => {
                  setCustomWater(e.target.value);
                  if (e.target.value.trim()) setSelectedWater("");
                }}
                className="rounded-xl"
              />
            </div>

            {hasUsgsData && !customWater.trim() && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or choose from USGS data</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search water bodies..."
                    value={waterSearch}
                    onChange={(e) => setWaterSearch(e.target.value)}
                    className="rounded-xl pl-9"
                  />
                </div>
                {loadingWater ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                    {filteredWaterBodies.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 text-center">No matches</p>
                    ) : (
                      filteredWaterBodies.map((w) => (
                        <button
                          key={w}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            selectedWater === w
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted text-foreground"
                          }`}
                          onClick={() => {
                            setSelectedWater(w);
                            setCustomWater("");
                          }}
                        >
                          {w}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-between">
              <Button variant="outline" className="rounded-xl gap-1" onClick={() => setStep("state")}>
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={handleNextToUsgs}
                disabled={!effectiveWater}
                className="rounded-xl gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2.5: USGS Location */}
        {step === "usgs" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Optionally link a USGS monitoring station to this spot for water flow data. Skip if unsure.
            </p>

            {loadingUsgs ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : usgsLocations.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No USGS monitoring stations found for {effectiveWater}.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                {usgsLocations.map((loc) => (
                  <button
                    key={loc.site_id}
                    type="button"
                    className={`w-full text-left px-3 py-2.5 transition-colors ${
                      selectedUsgs?.site_id === loc.site_id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-foreground"
                    }`}
                    onClick={() => {
                      setSelectedUsgs(selectedUsgs?.site_id === loc.site_id ? null : loc);
                      if (loc.latitude && loc.longitude) {
                        setMapCenter({ lat: loc.latitude, lng: loc.longitude });
                      }
                    }}
                  >
                    <p className="text-sm font-medium truncate">{loc.monitoring_location_name}</p>
                    <p className="text-xs text-muted-foreground">
                      <Navigation className="w-3 h-3 inline mr-1" />
                      {loc.site_id}
                      {loc.latitude && loc.longitude && (
                        <span className="ml-2 tabular-nums">
                          {loc.latitude.toFixed(3)}, {loc.longitude.toFixed(3)}
                        </span>
                      )}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" className="rounded-xl gap-1" onClick={() => setStep("water")}>
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={() => setStep("coordinates")} className="rounded-xl gap-1">
                {selectedUsgs ? "Next" : "Skip"} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Coordinates */}
        {step === "coordinates" && (
          <div className="space-y-4">
            <Input
              placeholder="Spot name (optional, e.g. 'My Secret Spot')"
              value={spotName}
              onChange={(e) => setSpotName(e.target.value)}
              className="rounded-xl"
            />

            <p className="text-xs text-muted-foreground">
              Tap the map to add points. Label them before tapping (e.g. "bass hole", "parking", "bank").
            </p>

            <div className="flex gap-2">
              <Input
                placeholder="Label for next pin"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="rounded-xl flex-1"
              />
              <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1 shrink-0" onClick={handleLocateMe}>
                <MapPin className="w-3.5 h-3.5" /> My location
              </Button>
            </div>

            <MapSection apiKey={apiKey} points={points} onMapClick={handleMapClick} mapRef={mapRef} initialCenter={mapCenter} />

            {points.length > 0 && (
              <div className="space-y-1.5">
                {points.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-muted rounded-lg text-sm">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="flex-1 truncate font-medium text-foreground">{p.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                    </span>
                    <button type="button" onClick={() => removePoint(i)} className="text-muted-foreground hover:text-destructive p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" className="rounded-xl gap-1" onClick={() => setStep("usgs")}>
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Spot
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Map sub-component */
const MapSection = ({
  apiKey,
  points,
  onMapClick,
  mapRef,
  initialCenter,
}: {
  apiKey: string | null;
  points: SpotPoint[];
  onMapClick: (e: google.maps.MapMouseEvent) => void;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  initialCenter?: { lat: number; lng: number } | null;
}) => {
  if (!apiKey) {
    return (
      <div className="h-[260px] rounded-xl bg-muted flex items-center justify-center text-sm text-muted-foreground">
        Map unavailable — add points manually
      </div>
    );
  }
  return <MapInner apiKey={apiKey} points={points} onMapClick={onMapClick} mapRef={mapRef} initialCenter={initialCenter} />;
};

const MapInner = ({
  apiKey,
  points,
  onMapClick,
  mapRef,
  initialCenter,
}: {
  apiKey: string;
  points: SpotPoint[];
  onMapClick: (e: google.maps.MapMouseEvent) => void;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  initialCenter?: { lat: number; lng: number } | null;
}) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, id: "google-map-script" });

  const center = points.length > 0
    ? { lat: points[points.length - 1].latitude, lng: points[points.length - 1].longitude }
    : initialCenter || { lat: 32.87, lng: -97.34 };

  const zoom = points.length > 0 ? 13 : initialCenter ? 12 : 6;

  if (!isLoaded) {
    return (
      <div className="h-[260px] rounded-xl bg-muted flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={zoom}
      onClick={onMapClick}
      onLoad={(map) => { mapRef.current = map; }}
      options={{ disableDefaultUI: true, zoomControl: true, mapTypeControl: false, streetViewControl: false }}
    >
      {points.map((p, i) => (
        <Marker key={i} position={{ lat: p.latitude, lng: p.longitude }} title={p.label} />
      ))}
    </GoogleMap>
  );
};

export default SpotCreationModal;
