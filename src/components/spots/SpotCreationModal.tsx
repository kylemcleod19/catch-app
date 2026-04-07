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
import {
  ChevronLeft, ChevronRight, Loader2, MapPin, Plus, X, Search,
  Navigation, Move,
} from "lucide-react";
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
  available_params?: string[];
}

interface MapView {
  center: { lat: number; lng: number };
  zoom: number;
}

interface SpotCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpotCreated: (spot: CreatedSpot) => void;
  initialStateCode?: string;
}

type Step = "state" | "water" | "map" | "usgs_select" | "naming";
type MapStage = "navigate" | "pin";

const LIBRARIES: ("places")[] = ["places"];
const USGS_FLAG_COLORS = ["#E53E3E", "#3182CE", "#38A169"];
const PIN_COLORS = [
  "#E53E3E", "#3182CE", "#38A169", "#D69E2E", "#9F7AEA",
  "#ED64A6", "#DD6B20", "#319795", "#5A67D8", "#B83280",
];
const getPinColor = (idx: number) => PIN_COLORS[idx % PIN_COLORS.length];

const pinSvgIcon = (color: string, label: string) =>
  "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="${color}"/>
      <text x="16" y="20" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial">${label}</text>
    </svg>`
  );

// Simple cache for USGS site available parameters
const usgsParamsCache = new Map<string, string[]>();

const SpotCreationModal = ({ open, onOpenChange, onSpotCreated, initialStateCode }: SpotCreationModalProps) => {
  const { user } = useAuth();
  const { homeState, updateHomeState } = useHomeState();
  const [step, setStep] = useState<Step>("state");
  const [saving, setSaving] = useState(false);

  const [stateCode, setStateCode] = useState(initialStateCode ?? "");
  const [saveAsHome, setSaveAsHome] = useState(false);

  const [waterBodies, setWaterBodies] = useState<string[]>([]);
  const [loadingWater, setLoadingWater] = useState(false);
  const [waterInput, setWaterInput] = useState("");
  const [isUsgsWater, setIsUsgsWater] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [mapStage, setMapStage] = useState<MapStage>("navigate");
  const [pins, setPins] = useState<SpotPoint[]>([]);
  const [pendingPinCoords, setPendingPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapView, setMapView] = useState<MapView | null>(null);
  const [autoSearchQuery, setAutoSearchQuery] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const [nearbyUsgs, setNearbyUsgs] = useState<UsgsLocation[]>([]);
  const [loadingUsgs, setLoadingUsgs] = useState(false);
  const [selectedUsgs, setSelectedUsgs] = useState<UsgsLocation | null>(null);

  const [spotName, setSpotName] = useState("");

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
    });
  }, []);

  useEffect(() => {
    if (!stateCode) return;
    setLoadingWater(true);
    supabase
      .rpc("get_distinct_water_bodies", { _state_code: stateCode })
      .then(({ data }) => {
        const bodies = (data || []).map((d: any) => d.normalized_water_body as string).filter(Boolean);
        setWaterBodies(bodies);
        setLoadingWater(false);
      });
  }, [stateCode]);

  useEffect(() => {
    if (open) {
      const defaultState = initialStateCode ?? homeState ?? "";
      setStep(defaultState ? "water" : "state");
      setStateCode(defaultState);
      setWaterInput("");
      setIsUsgsWater(false);
      setShowSuggestions(false);
      setSpotName("");
      setPins([]);
      setMapView(null);
      setAutoSearchQuery(null);
      setSaveAsHome(false);
      setSelectedUsgs(null);
      setNearbyUsgs([]);
      setPendingPinCoords(null);
      setMapStage("navigate");
    }
  }, [open, initialStateCode, homeState]);

  const suggestions = waterInput.trim().length >= 2
    ? waterBodies.filter((w) => w.toLowerCase().includes(waterInput.toLowerCase())).slice(0, 20)
    : [];

  const handleSelectSuggestion = (body: string) => {
    setWaterInput(body);
    setIsUsgsWater(true);
    setShowSuggestions(false);
  };

  const handleWaterInputChange = (val: string) => {
    setWaterInput(val);
    setIsUsgsWater(waterBodies.includes(val));
    setShowSuggestions(val.trim().length >= 2);
  };

  const findNearbyUsgs = useCallback(async () => {
    if (!isUsgsWater || !waterInput || !stateCode) return false;
    setLoadingUsgs(true);

    const { data } = await supabase
      .from("usgs_fishing_water_bodies")
      .select("site_id, monitoring_location_name, latitude, longitude")
      .eq("state_code", stateCode)
      .eq("normalized_water_body", waterInput)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (!data || data.length === 0) {
      setLoadingUsgs(false);
      return false;
    }

    let refLat: number, refLng: number;
    if (pins.length > 0) {
      refLat = pins.reduce((s, p) => s + p.latitude, 0) / pins.length;
      refLng = pins.reduce((s, p) => s + p.longitude, 0) / pins.length;
    } else if (mapRef.current) {
      const c = mapRef.current.getCenter();
      refLat = c?.lat() ?? 32;
      refLng = c?.lng() ?? -97;
    } else {
      refLat = 32; refLng = -97;
    }

    const withDist = data.map((loc) => ({
      ...loc,
      dist: Math.sqrt(Math.pow((loc.latitude! - refLat), 2) + Math.pow((loc.longitude! - refLng), 2)),
    }));
    withDist.sort((a, b) => a.dist - b.dist);
    const top3 = withDist.slice(0, 3) as UsgsLocation[];

    const enriched = await Promise.all(
      top3.map(async (loc) => {
        // Check cache first
        const cached = usgsParamsCache.get(loc.site_id);
        if (cached) return { ...loc, available_params: cached };
        try {
          const resp = await fetch(
            `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${loc.site_id}&siteStatus=all&period=PT2H`
          );
          if (resp.ok) {
            const json = await resp.json();
            const ts = json?.value?.timeSeries || [];
            const params = [...new Set(ts.map((t: any) => {
              const name = t?.variable?.variableName || "";
              return name.split(",")[0].trim();
            }).filter(Boolean))] as string[];
            usgsParamsCache.set(loc.site_id, params);
            return { ...loc, available_params: params };
          }
        } catch { /* ignore */ }
        usgsParamsCache.set(loc.site_id, []);
        return { ...loc, available_params: [] as string[] };
      })
    );

    setNearbyUsgs(enriched);
    setLoadingUsgs(false);
    return enriched.length > 0;
  }, [isUsgsWater, waterInput, stateCode, pins]);

  const handlePlaceSelected = (place: { name: string; lat: number; lng: number }) => {
    setMapView({ center: { lat: place.lat, lng: place.lng }, zoom: 15 });
    mapRef.current?.panTo({ lat: place.lat, lng: place.lng });
    mapRef.current?.setZoom(15);
  };

  const handleMapViewChange = useCallback((nextView: MapView) => {
    setMapView((prev) => {
      if (
        prev &&
        prev.zoom === nextView.zoom &&
        Math.abs(prev.center.lat - nextView.center.lat) < 0.000001 &&
        Math.abs(prev.center.lng - nextView.center.lng) < 0.000001
      ) {
        return prev;
      }

      return nextView;
    });
  }, []);

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

  const handleGoToMap = () => {
    if (saveAsHome && stateCode) updateHomeState(stateCode);
    setMapView(null);
    setMapStage("navigate");
    const stateName = getStateName(stateCode);
    setAutoSearchQuery(`${waterInput}, ${stateName}`);
    setStep("map");
  };

  const handleMapFinish = async () => {
    if (isUsgsWater) {
      const hasUsgs = await findNearbyUsgs();
      if (hasUsgs) {
        setStep("usgs_select");
        return;
      }
    }
    setStep("naming");
  };

  const handleSave = async () => {
    if (!user || !waterInput.trim() || !stateCode) return;
    setSaving(true);
    try {
      const { data: spot, error } = await supabase
        .from("spots")
        .insert({
          user_id: user.id,
          name: spotName || null,
          body_of_water: waterInput.trim(),
          state_code: stateCode,
          site_type: "Stream",
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
        body_of_water: waterInput.trim(),
        state_code: stateCode,
        site_type: "Stream",
        points: pins,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create spot");
    } finally {
      setSaving(false);
    }
  };

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
            mapView={mapView}
            mapRef={mapRef}
            effectiveWater={waterInput}
            stateCode={stateCode}
            autoSearchQuery={autoSearchQuery}
            onAutoSearchDone={() => setAutoSearchQuery(null)}
            onPlaceSelected={handlePlaceSelected}
            onMapViewChange={handleMapViewChange}
            onConfirmPin={confirmPin}
            onCancelPin={cancelPin}
            onRemovePin={removePin}
            onLocateMe={handleLocateMe}
            onBack={() => setStep("water")}
            onFinish={handleMapFinish}
          />
        </DialogContent>
      </Dialog>
    );
  }

  if (step === "usgs_select") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-none w-screen h-screen p-0 m-0 border-0 rounded-none [&>button]:hidden">
          <FullScreenUsgsStep
            apiKey={apiKey}
            userPins={pins}
            usgsLocations={nearbyUsgs}
            selectedUsgs={selectedUsgs}
            setSelectedUsgs={setSelectedUsgs}
            loadingUsgs={loadingUsgs}
            waterName={waterInput}
            stateName={getStateName(stateCode)}
            onBack={() => { setStep("map"); }}
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

        {step === "water" && (
          <div className="space-y-4">

            <div className="space-y-1 relative">
              <label className="text-sm font-medium text-foreground">Water body name</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Type to search or enter a custom name..."
                  value={waterInput}
                  onChange={(e) => handleWaterInputChange(e.target.value)}
                  onFocus={() => waterInput.trim().length >= 2 && setShowSuggestions(true)}
                  className="rounded-xl pl-9"
                  autoFocus
                />
              </div>
              {isUsgsWater && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> USGS monitored water body
                </p>
              )}
              {!isUsgsWater && waterInput.trim().length > 0 && (
                <p className="text-xs text-muted-foreground">Custom water body (no USGS data)</p>
              )}

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-border">
                  {loadingWater ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                  ) : (
                    suggestions.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-foreground transition-colors"
                        onClick={() => handleSelectSuggestion(w)}
                      >
                        {w}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" className="rounded-xl gap-1" onClick={() => setStep("state")}>
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={handleGoToMap}
                disabled={!waterInput.trim()}
                className="rounded-xl gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              on <span className="font-semibold text-foreground">{waterInput}</span>
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

            <div className="bg-muted rounded-xl p-3 space-y-1.5 text-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Summary</p>
              <p className="text-foreground">{waterInput} · {getStateName(stateCode)}</p>
              {pins.length > 0 && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <MapPin className="w-3 h-3 text-primary" /> {pins.length} pin{pins.length !== 1 ? "s" : ""}
                </div>
              )}
              {selectedUsgs && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Navigation className="w-3 h-3 text-primary" /> {selectedUsgs.monitoring_location_name}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" className="rounded-xl gap-1" onClick={() => {
                if (nearbyUsgs.length > 0) {
                  setStep("usgs_select");
                } else {
                  setMapStage("pin");
                  setStep("map");
                }
              }}>
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

/* ─── USGS Selection Map ─── */

const UsgsSelectionMap = ({
  apiKey, userPins, usgsLocations, selectedUsgs,
}: {
  apiKey: string;
  userPins: SpotPoint[];
  usgsLocations: UsgsLocation[];
  selectedUsgs: UsgsLocation | null;
}) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, id: "google-map-script", libraries: LIBRARIES });
  const localMapRef = useRef<google.maps.Map | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    localMapRef.current = map;
    const bounds = new google.maps.LatLngBounds();
    userPins.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    usgsLocations.forEach((l) => {
      if (l.latitude && l.longitude) bounds.extend({ lat: l.latitude, lng: l.longitude });
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
  }, [userPins, usgsLocations]);

  if (!isLoaded) {
    return <div className="h-[200px] rounded-xl bg-muted flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "200px", borderRadius: "0.75rem" }}
      center={{ lat: 32, lng: -97 }}
      zoom={8}
      onLoad={onLoad}
      options={{ gestureHandling: "cooperative", zoomControl: true, mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}
    >
      {userPins.map((p, i) => (
        <Marker
          key={`pin-${i}`}
          position={{ lat: p.latitude, lng: p.longitude }}
          title={p.label}
          icon={{
            url: "data:image/svg+xml," + encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="hsl(142,71%,45%)" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
            ),
            scaledSize: new google.maps.Size(28, 28),
          }}
        />
      ))}
      {usgsLocations.map((loc, idx) => (
        loc.latitude && loc.longitude && (
          <Marker
            key={`usgs-${loc.site_id}`}
            position={{ lat: loc.latitude, lng: loc.longitude }}
            title={`${idx + 1}: ${loc.monitoring_location_name}`}
            icon={{
              url: "data:image/svg+xml," + encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
                  <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="${USGS_FLAG_COLORS[idx] || '#718096'}"/>
                  <text x="16" y="20" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">${idx + 1}</text>
                </svg>`
              ),
              scaledSize: new google.maps.Size(32, 40),
              anchor: new google.maps.Point(16, 40),
            }}
            zIndex={selectedUsgs?.site_id === loc.site_id ? 100 : 50}
          />
        )
      ))}
    </GoogleMap>
  );
};

/* ─── Full-Screen Map Step ─── */

const FullScreenMapStep = ({
  mapStage, setMapStage, pins, pendingPinCoords, setPendingPinCoords,
  apiKey, mapView, mapRef, effectiveWater, stateCode,
  autoSearchQuery, onAutoSearchDone,
  onPlaceSelected, onMapViewChange, onConfirmPin, onCancelPin, onRemovePin, onLocateMe, onBack, onFinish,
}: {
  mapStage: MapStage;
  setMapStage: (s: MapStage) => void;
  pins: SpotPoint[];
  pendingPinCoords: { lat: number; lng: number } | null;
  setPendingPinCoords: (c: { lat: number; lng: number } | null) => void;
  apiKey: string | null;
  mapView: MapView | null;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  effectiveWater: string;
  stateCode: string;
  autoSearchQuery: string | null;
  onAutoSearchDone: () => void;
  onPlaceSelected: (place: { name: string; lat: number; lng: number }) => void;
  onMapViewChange: (view: MapView) => void;
  onConfirmPin: (label: string) => void;
  onCancelPin: () => void;
  onRemovePin: (idx: number) => void;
  onLocateMe: () => void;
  onBack: () => void;
  onFinish: () => void;
}) => {
  const isNavigate = mapStage === "navigate";
  const [isSatellite, setIsSatellite] = useState(false);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50 safe-area-top">
        <div className="px-3 pt-2 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{effectiveWater}</p>
              <p className="text-xs text-muted-foreground">{getStateName(stateCode)}</p>
            </div>
          </div>

          <PlacesAutocomplete onPlaceSelected={onPlaceSelected} />

          {pins.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {pins.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs text-white" style={{ backgroundColor: getPinColor(i) }}>
                  <MapPin className="w-3 h-3" />
                  {p.label}
                  <button type="button" onClick={() => onRemovePin(i)} className="text-white/70 hover:text-white p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        {apiKey ? (
          <FullScreenMap
            apiKey={apiKey}
            mapRef={mapRef}
            initialView={mapView}
            pins={pins}
            isNavigate={isNavigate}
            isSatellite={isSatellite}
            autoSearchQuery={autoSearchQuery}
            onAutoSearchDone={onAutoSearchDone}
            onMapViewChange={onMapViewChange}
            onMapClick={(coords) => {
              if (!isNavigate) setPendingPinCoords(coords);
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
          onConfirm={(label) => {
            onConfirmPin(label);
            setMapStage("navigate"); // go back to navigate after adding pin
          }}
          onCancel={onCancelPin}
        />
      )}

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-background/90 backdrop-blur-md border-t border-border/50 safe-area-bottom">
        <div className="px-3 py-3 flex items-center justify-between">
          <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>

          <div className="flex items-center gap-1.5">
            {/* Satellite toggle */}
            <Button
              variant={isSatellite ? "default" : "outline"}
              size="sm"
              className="rounded-xl text-xs px-2.5"
              onClick={() => setIsSatellite(!isSatellite)}
            >
              {isSatellite ? "Map" : "Satellite"}
            </Button>

            {/* Mode toggle */}
            {isNavigate ? (
              <Button size="sm" className="rounded-xl gap-1" onClick={() => setMapStage("pin")}>
                <Plus className="w-4 h-4" /> Add Pin
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => setMapStage("navigate")}>
                <Move className="w-4 h-4" /> Pan
              </Button>
            )}
          </div>

          <Button size="sm" className="rounded-xl gap-1" onClick={onFinish}>
            {pins.length > 0 ? "Finish" : "Skip"} <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ─── Full Screen Map Inner ─── */

const FullScreenMap = ({
  apiKey, mapRef, initialView, pins, isNavigate, isSatellite, autoSearchQuery, onAutoSearchDone, onMapViewChange, onMapClick, onLocateMe,
}: {
  apiKey: string;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  initialView: MapView | null;
  pins: SpotPoint[];
  isNavigate: boolean;
  isSatellite: boolean;
  autoSearchQuery: string | null;
  onAutoSearchDone: () => void;
  onMapViewChange: (view: MapView) => void;
  onMapClick: (coords: { lat: number; lng: number }) => void;
  onLocateMe: () => void;
}) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, id: "google-map-script", libraries: LIBRARIES });
  const didAutoSearch = useRef(false);

  const baseView = initialView ?? {
    center: { lat: 39.8283, lng: -98.5795 },
    zoom: 5,
  };

  // Apply map type when satellite toggle changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setMapTypeId(isSatellite ? "satellite" : "roadmap");
  }, [isSatellite, mapRef]);

  // Apply options imperatively when stage changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (isNavigate) {
      mapRef.current.setOptions({
        gestureHandling: "greedy",
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
      });
    } else {
      mapRef.current.setOptions({
        gestureHandling: "none",
        zoomControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        draggable: false,
        scrollwheel: false,
        disableDoubleClickZoom: true,
      });
    }
  }, [isNavigate, mapRef]);

  useEffect(() => {
    didAutoSearch.current = false;
  }, [autoSearchQuery]);

  useEffect(() => {
    if (!isLoaded || !autoSearchQuery || didAutoSearch.current) return;
    didAutoSearch.current = true;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: autoSearchQuery }, (results, status) => {
      const firstResult = results?.[0];

      if (status === "OK" && firstResult?.geometry?.location) {
        const location = firstResult.geometry.location;
        const nextCenter = { lat: location.lat(), lng: location.lng() };

        if (firstResult.geometry.viewport && mapRef.current) {
          mapRef.current.fitBounds(firstResult.geometry.viewport);
          window.setTimeout(() => {
            const center = mapRef.current?.getCenter();
            const zoom = mapRef.current?.getZoom();
            if (center && typeof zoom === "number") {
              onMapViewChange({
                center: { lat: center.lat(), lng: center.lng() },
                zoom,
              });
            }
          }, 0);
        } else {
          mapRef.current?.panTo(nextCenter);
          mapRef.current?.setZoom(13);
          onMapViewChange({ center: nextCenter, zoom: 13 });
        }
      }

      onAutoSearchDone();
    });
  }, [isLoaded, autoSearchQuery, onAutoSearchDone, onMapViewChange, mapRef]);

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
        map.setCenter(baseView.center);
        map.setZoom(baseView.zoom);
        map.setMapTypeId(isSatellite ? "satellite" : "roadmap");
        map.setOptions({
          gestureHandling: isNavigate ? "greedy" : "none",
          zoomControl: isNavigate,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          draggable: isNavigate,
          scrollwheel: isNavigate,
          disableDoubleClickZoom: !isNavigate,
        });
      }}
      onUnmount={() => {
        mapRef.current = null;
      }}
      onIdle={() => {
        const center = mapRef.current?.getCenter();
        const zoom = mapRef.current?.getZoom();
        if (center && typeof zoom === "number") {
          onMapViewChange({
            center: { lat: center.lat(), lng: center.lng() },
            zoom,
          });
        }
      }}
      onClick={(e) => {
        if (!isNavigate && e.latLng) {
          onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      }}
    >
      {pins.map((p, i) => (
        <Marker
          key={i}
          position={{ lat: p.latitude, lng: p.longitude }}
          title={p.label}
          icon={{
            url: pinSvgIcon(getPinColor(i), String(i + 1)),
            scaledSize: new google.maps.Size(32, 40),
            anchor: new google.maps.Point(16, 40),
          }}
        />
      ))}
    </GoogleMap>
  );
};

export default SpotCreationModal;
