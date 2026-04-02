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
import { ChevronLeft, ChevronRight, Loader2, MapPin, Plus, X, Search, Navigation, Layers, Lock, Move } from "lucide-react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import PlacesAutocomplete from "./PlacesAutocomplete";
import HoleNamingPrompt from "./HoleNamingPrompt";

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

type Step = "state" | "water" | "usgs" | "map" | "naming";
type MapStage = "navigate" | "pin";

const LIBRARIES: ("places")[] = ["places"];

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

  // Step 2.5: USGS
  const [usgsLocations, setUsgsLocations] = useState<UsgsLocation[]>([]);
  const [loadingUsgs, setLoadingUsgs] = useState(false);
  const [selectedUsgs, setSelectedUsgs] = useState<UsgsLocation | null>(null);

  // Map step
  const [mapStage, setMapStage] = useState<MapStage>("navigate");
  const [pins, setPins] = useState<SpotPoint[]>([]);
  const [pendingPinCoords, setPendingPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  // Naming step
  const [spotName, setSpotName] = useState("");

  // Fetch Google Maps API key
  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  // Fetch water bodies
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
      setSpotName("");
      setPins([]);
      setMapCenter(null);
      setSaveAsHome(false);
      setSelectedUsgs(null);
      setUsgsLocations([]);
      setPendingPinCoords(null);
      setMapStage("navigate");
    }
  }, [open, initialStateCode, homeState]);

  const effectiveWater = customWater.trim() || selectedWater;

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

  const handleNextToUsgs = async () => {
    if (saveAsHome && stateCode) await updateHomeState(stateCode);
    await fetchUsgsLocations();
    setStep("usgs");
  };

  const handlePlaceSelected = (place: { name: string; lat: number; lng: number }) => {
    mapRef.current?.panTo({ lat: place.lat, lng: place.lng });
    mapRef.current?.setZoom(15);
  };

  const confirmPin = (label: string) => {
    if (pendingPinCoords) {
      setPins((prev) => [...prev, { label, latitude: pendingPinCoords.lat, longitude: pendingPinCoords.lng }]);
      setPendingPinCoords(null);
    }
  };

  const cancelPin = () => setPendingPinCoords(null);
  const removePin = (idx: number) => setPins((prev) => prev.filter((_, i) => i !== idx));

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapRef.current?.panTo(loc);
        mapRef.current?.setZoom(14);
      },
      () => {}
    );
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

      if (pins.length > 0) {
        const { error: ptErr } = await supabase.from("spot_points").insert(
          pins.map((p) => ({ spot_id: spot.id, label: p.label, latitude: p.latitude, longitude: p.longitude })) as any
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
        points: pins,
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

  // Full-screen map step
  if (step === "map") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-none w-screen h-screen p-0 m-0 border-0 rounded-none [&>button]:hidden">
          <FullScreenMapStep
            mapStage={mapStage}
            setMapStage={setMapStage}
            pins={pins}
            pendingPinCoords={pendingPinCoords}
            setPendingPinCoords={setPendingPinCoords}
            apiKey={apiKey}
            mapCenter={mapCenter}
            mapRef={mapRef}
            effectiveWater={effectiveWater}
            stateCode={stateCode}
            onPlaceSelected={handlePlaceSelected}
            onConfirmPin={confirmPin}
            onCancelPin={cancelPin}
            onRemovePin={removePin}
            onLocateMe={handleLocateMe}
            onBack={() => setStep("usgs")}
            onFinish={() => setStep("naming")}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {step === "state" && "Select State"}
            {step === "water" && "Select Body of Water"}
            {step === "usgs" && "Link USGS Location"}
            {step === "naming" && "Name Your Spot"}
          </DialogTitle>
          {step !== "state" && stateCode && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
              onClick={() => setStep("state")}
            >
              <MapPin className="w-3 h-3" />
              {getStateName(stateCode)}
              <span className="text-[10px] underline">change</span>
            </button>
          )}
        </DialogHeader>

        {/* Step 1: State */}
        {step === "state" && (
          <div className="space-y-4">
            {homeState && (
              <div className="p-3 bg-muted rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Your home state</p>
                <p className="text-sm font-medium text-foreground">{getStateName(homeState)}</p>
              </div>
            )}
            <Select value={stateCode} onValueChange={setStateCode}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Choose a state" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {US_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
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
              <Button type="button" variant={siteType === "Stream" ? "default" : "outline"} size="sm" className="rounded-xl flex-1" onClick={() => setSiteType("Stream")}>
                Stream / River
              </Button>
              <Button type="button" variant={siteType === "Lake, Reservoir, Impoundment" ? "default" : "outline"} size="sm" className="rounded-xl flex-1" onClick={() => setSiteType("Lake, Reservoir, Impoundment")}>
                Lake
              </Button>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Name of water body</label>
              <Input
                placeholder="e.g. Brushy Creek, My Private Pond"
                value={customWater}
                onChange={(e) => { setCustomWater(e.target.value); if (e.target.value.trim()) setSelectedWater(""); }}
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
                  <Input placeholder="Search water bodies..." value={waterSearch} onChange={(e) => setWaterSearch(e.target.value)} className="rounded-xl pl-9" />
                </div>
                {loadingWater ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                    {filteredWaterBodies.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 text-center">No matches</p>
                    ) : (
                      filteredWaterBodies.map((w) => (
                        <button key={w} type="button" className={`w-full text-left px-3 py-2 text-sm transition-colors ${selectedWater === w ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`} onClick={() => { setSelectedWater(w); setCustomWater(""); }}>
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
              <Button onClick={handleNextToUsgs} disabled={!effectiveWater} className="rounded-xl gap-1">
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2.5: USGS */}
        {step === "usgs" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Optionally link a USGS monitoring station for water flow data. Skip if unsure.</p>
            {loadingUsgs ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : usgsLocations.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">No USGS stations found for {effectiveWater}.</div>
            ) : (
              <div className="max-h-64 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                {usgsLocations.map((loc) => (
                  <button key={loc.site_id} type="button" className={`w-full text-left px-3 py-2.5 transition-colors ${selectedUsgs?.site_id === loc.site_id ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"}`}
                    onClick={() => {
                      setSelectedUsgs(selectedUsgs?.site_id === loc.site_id ? null : loc);
                      if (loc.latitude && loc.longitude) setMapCenter({ lat: loc.latitude, lng: loc.longitude });
                    }}
                  >
                    <p className="text-sm font-medium truncate">{loc.monitoring_location_name}</p>
                    <p className="text-xs text-muted-foreground">
                      <Navigation className="w-3 h-3 inline mr-1" />{loc.site_id}
                      {loc.latitude && loc.longitude && <span className="ml-2 tabular-nums">{loc.latitude.toFixed(3)}, {loc.longitude.toFixed(3)}</span>}
                    </p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" className="rounded-xl gap-1" onClick={() => setStep("water")}><ChevronLeft className="w-4 h-4" /> Back</Button>
              <Button onClick={() => { setMapStage("navigate"); setStep("map"); }} className="rounded-xl gap-1">
                {selectedUsgs ? "Next" : "Skip"} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Naming */}
        {step === "naming" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              on <span className="font-semibold text-foreground">{effectiveWater}</span>
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Spot name (optional)</label>
              <Input
                placeholder="e.g. Allen Bates Park, My secret spot"
                value={spotName}
                onChange={(e) => setSpotName(e.target.value)}
                className="rounded-xl"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Give it a memorable name. The water body is already saved separately.
              </p>
            </div>

            {/* Summary */}
            <div className="bg-muted rounded-xl p-3 space-y-1.5 text-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Summary</p>
              <p className="text-foreground">{effectiveWater} · {getStateName(stateCode)}</p>
              {pins.length > 0 && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <MapPin className="w-3 h-3 text-primary" /> {pins.length} pin{pins.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" className="rounded-xl gap-1" onClick={() => { setMapStage("pin"); setStep("map"); }}>
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

/* ─── Full-Screen Map Step ─── */

const FullScreenMapStep = ({
  mapStage, setMapStage, pins, pendingPinCoords, setPendingPinCoords,
  apiKey, mapCenter, mapRef, effectiveWater, stateCode,
  onPlaceSelected, onConfirmPin, onCancelPin, onRemovePin, onLocateMe, onBack, onFinish,
}: {
  mapStage: MapStage;
  setMapStage: (s: MapStage) => void;
  pins: SpotPoint[];
  pendingPinCoords: { lat: number; lng: number } | null;
  setPendingPinCoords: (c: { lat: number; lng: number } | null) => void;
  apiKey: string | null;
  mapCenter: { lat: number; lng: number } | null;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  effectiveWater: string;
  stateCode: string;
  onPlaceSelected: (place: { name: string; lat: number; lng: number }) => void;
  onConfirmPin: (label: string) => void;
  onCancelPin: () => void;
  onRemovePin: (idx: number) => void;
  onLocateMe: () => void;
  onBack: () => void;
  onFinish: () => void;
}) => {
  const isNavigate = mapStage === "navigate";

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50 safe-area-top">
        <div className="px-3 pt-2 pb-2 space-y-2">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{effectiveWater}</p>
              <p className="text-xs text-muted-foreground">{getStateName(stateCode)}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {isNavigate ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  <Move className="w-3 h-3" /> Navigate
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded-full">
                  <MapPin className="w-3 h-3" /> Add Pins
                </span>
              )}
            </div>
          </div>

          {/* Search bar - only in navigate mode */}
          {isNavigate && (
            <PlacesAutocomplete map={mapRef.current} onPlaceSelected={onPlaceSelected} />
          )}

          {/* Pin list - only in pin mode */}
          {!isNavigate && pins.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {pins.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-muted text-xs text-foreground">
                  <MapPin className="w-3 h-3 text-primary" />
                  {p.label}
                  <button type="button" onClick={() => onRemovePin(i)} className="text-muted-foreground hover:text-destructive p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {!isNavigate && pins.length === 0 && (
            <p className="text-xs text-muted-foreground">Tap the map to drop a pin</p>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        {apiKey ? (
          <FullScreenMap
            apiKey={apiKey}
            mapRef={mapRef}
            initialCenter={mapCenter}
            pins={pins}
            isNavigate={isNavigate}
            onMapClick={(coords) => {
              if (!isNavigate) {
                setPendingPinCoords(coords);
              }
            }}
            onLocateMe={onLocateMe}
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-sm text-muted-foreground">
            Map unavailable
          </div>
        )}
      </div>

      {/* Naming prompt overlay */}
      {pendingPinCoords && !isNavigate && (
        <HoleNamingPrompt
          holeCount={pins.length}
          onConfirm={onConfirmPin}
          onCancel={onCancelPin}
        />
      )}

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-background/90 backdrop-blur-md border-t border-border/50 safe-area-bottom">
        <div className="px-3 py-3 flex items-center justify-between">
          {isNavigate ? (
            <>
              <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={onBack}>
                <ChevronLeft className="w-4 h-4" /> State
              </Button>
              <Button size="sm" className="rounded-xl gap-1" onClick={() => setMapStage("pin")}>
                Add Pins <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => setMapStage("navigate")}>
                <Move className="w-4 h-4" /> Zoom
              </Button>
              <Button size="sm" className="rounded-xl gap-1" onClick={onFinish}>
                {pins.length > 0 ? "Finish" : "Skip"} <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Full Screen Map Inner ─── */

const FullScreenMap = ({
  apiKey, mapRef, initialCenter, pins, isNavigate, onMapClick, onLocateMe,
}: {
  apiKey: string;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  initialCenter: { lat: number; lng: number } | null;
  pins: SpotPoint[];
  isNavigate: boolean;
  onMapClick: (coords: { lat: number; lng: number }) => void;
  onLocateMe: () => void;
}) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, id: "google-map-script", libraries: LIBRARIES });

  const center = initialCenter || { lat: 32.87, lng: -97.34 };
  const zoom = initialCenter ? 14 : 10;

  if (!isLoaded) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const navigateOptions: google.maps.MapOptions = {
    gestureHandling: "greedy",
    zoomControl: true,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: false,
  };

  const pinOptions: google.maps.MapOptions = {
    gestureHandling: "none",
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    draggable: false,
    scrollwheel: false,
    disableDoubleClickZoom: true,
  };

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={center}
      zoom={zoom}
      onLoad={(map) => { mapRef.current = map; }}
      onClick={(e) => {
        if (!isNavigate && e.latLng) {
          onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      }}
      options={isNavigate ? navigateOptions : pinOptions}
    >
      {pins.map((p, i) => (
        <Marker key={i} position={{ lat: p.latitude, lng: p.longitude }} title={p.label} />
      ))}
    </GoogleMap>
  );
};

export default SpotCreationModal;
