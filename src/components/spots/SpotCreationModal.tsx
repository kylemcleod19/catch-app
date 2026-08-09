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
  Navigation, Move, Waves, Droplets, Anchor,
} from "lucide-react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/lib/googleMaps";
import PlacesAutocomplete from "./PlacesAutocomplete";
import HoleNamingPrompt from "./HoleNamingPrompt";
import { fetchTideData } from "@/lib/tide";

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

type Step = "type" | "state" | "water" | "map" | "usgs_select" | "naming";
export type WaterType = "Stream" | "Lake" | "Tidal";

export const USGS_SITE_TYPE: Record<"Stream" | "Lake", string> = {
  Stream: "Stream",
  Lake: "Lake, Reservoir, Impoundment",
};

interface ResolvedStation {
  available: boolean;
  product: string;
  stationId?: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
  distanceMiles?: number;
  nearestDistanceMiles?: number;
  maxDistanceMiles?: number;
}
type MapStage = "navigate" | "pin";

const USGS_FLAG_COLORS = ["#E53E3E", "#3182CE"];
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

const FISHING_ROD_PIN_ICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="54" height="66" viewBox="0 0 54 66">' +
  '<path d="M27 62 C27 62 4 40 4 22 C4 10 14 2 27 2 C40 2 50 10 50 22 C50 40 27 62 27 62Z" fill="#F37920" stroke="#000" stroke-width="3"/>' +
  '<g transform="translate(15, 10) scale(1)" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/>' +
  '<path d="M18 12v.5"/>' +
  '<path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/>' +
  '<path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/>' +
  '<path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4"/>' +
  '<path d="m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98"/>' +
  '</g>' +
  '</svg>'
);

const SpotCreationModal = ({ open, onOpenChange, onSpotCreated, initialStateCode }: SpotCreationModalProps) => {
  const { user } = useAuth();
  const { homeState, updateHomeState } = useHomeState();
  const [step, setStep] = useState<Step>("type");
  const [waterType, setWaterType] = useState<WaterType>("Stream");
  const [tideStation, setTideStation] = useState<ResolvedStation | null>(null);
  const [resolvingTide, setResolvingTide] = useState(false);
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
    if (!stateCode || waterType === "Tidal") {
      setWaterBodies([]);
      return;
    }
    setLoadingWater(true);
    supabase
      .rpc("get_distinct_water_bodies", {
        _state_code: stateCode,
        _site_type: USGS_SITE_TYPE[waterType],
      })
      .then(({ data }) => {
        const bodies = (data || []).map((d: any) => d.normalized_water_body as string).filter(Boolean);
        setWaterBodies(bodies);
        setLoadingWater(false);
      });
  }, [stateCode, waterType]);

  useEffect(() => {
    if (open) {
      setStep("type");
      setWaterType("Stream");
      setTideStation(null);
      setStateCode(initialStateCode ?? homeState ?? "");
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
    if (waterType === "Tidal") return false;
    if (!isUsgsWater || !waterInput || !stateCode) return false;
    setLoadingUsgs(true);

    const { data } = await supabase
      .from("usgs_fishing_water_bodies")
      .select("site_id, monitoring_location_name, latitude, longitude")
      .eq("state_code", stateCode)
      .eq("normalized_water_body", waterInput)
      .eq("site_type", USGS_SITE_TYPE[waterType])
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
    const candidates = withDist.slice(0, 12) as UsgsLocation[];

    // Look up available data from cached table
    const siteIds = candidates.map((l) => l.site_id);
    const { data: availData } = await supabase
      .from("usgs_water_bodies_available_data")
      .select("site_id, water_flow, gage_height, temp, turbidity")
      .in("site_id", siteIds);

    const availMap = new Map<string, string[]>();
    const hasMetric = new Map<string, boolean>();
    // Streams are matched on discharge (flow); lakes/reservoirs on gage height (level)
    const requiredKey = waterType === "Stream" ? "water_flow" : "gage_height";
    (availData || []).forEach((row: any) => {
      const params: string[] = [];
      if (row.water_flow) params.push("Flow");
      if (row.gage_height) params.push("Gage Height");
      if (row.temp) params.push("Temp");
      if (row.turbidity) params.push("Turbidity");
      availMap.set(row.site_id, params);
      hasMetric.set(row.site_id, !!row[requiredKey]);
    });

    const matching = candidates.filter((l) => hasMetric.get(l.site_id));
    const chosen = (matching.length > 0 ? matching : candidates).slice(0, 2);

    const enriched = chosen.map((loc) => ({
      ...loc,
      available_params: availMap.get(loc.site_id) || [],
    }));

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
    if (waterType === "Tidal") {
      const ref = pins.length > 0
        ? { lat: pins[0].latitude, lng: pins[0].longitude }
        : mapRef.current?.getCenter()
          ? { lat: mapRef.current.getCenter()!.lat(), lng: mapRef.current.getCenter()!.lng() }
          : null;
      if (ref) {
        setResolvingTide(true);
        const res = await fetchTideData({ lat: ref.lat, lon: ref.lng, resolveOnly: true });
        setTideStation((res?.stations?.tide_predictions as ResolvedStation) || null);
        setResolvingTide(false);
      }
      setStep("naming");
      return;
    }
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
    const siteType = waterType === "Lake" ? "Lake" : waterType === "Tidal" ? "Tidal" : "Stream";
    setSaving(true);
    try {
      const { data: spot, error } = await supabase
        .from("spots")
        .insert({
          user_id: user.id,
          name: spotName || null,
          body_of_water: waterInput.trim(),
          state_code: stateCode,
          site_type: siteType,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      await createSpotTypeData(spot.id, siteType, {
        usgsSiteId: waterType === "Tidal" ? null : selectedUsgs?.site_id || null,
      });

      if (pins.length > 0) {
        const { error: ptErr } = await supabase.from("spot_points").insert(
          pins.map((p) => ({ spot_id: spot.id, label: p.label, latitude: p.latitude, longitude: p.longitude })) as any
        );
        if (ptErr) throw ptErr;
      }


      // Persist resolved NOAA stations for tidal spots (best-effort)
      if (waterType === "Tidal" && pins.length > 0) {
        fetchTideData({
          lat: pins[0].latitude,
          lon: pins[0].longitude,
          spotId: spot.id,
          resolveOnly: true,
        });
      }

      toast.success("Spot created!");
      onSpotCreated({
        id: spot.id,
        name: spotName || null,
        body_of_water: waterInput.trim(),
        state_code: stateCode,
        site_type: siteType,
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
        <DialogContent className="max-w-none w-screen h-[100dvh] max-h-[100dvh] p-0 m-0 border-0 rounded-none z-[60] [&>button]:hidden">
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
        <DialogContent className="max-w-none w-screen h-[100dvh] max-h-[100dvh] p-0 m-0 border-0 rounded-none z-[60] [&>button]:hidden">
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
            {step === "type" && "What Kind of Water?"}
            {step === "state" && "Select State"}
            {step === "water" && "Select Body of Water"}
            {step === "naming" && "Name Your Spot"}
          </DialogTitle>
          {step !== "type" && step !== "state" && stateCode && (
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

        {step === "type" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick the water type first — each one uses different data.
            </p>
            {([
              { key: "Stream" as const, title: "Stream / River", sub: "USGS gauges with flow (cfs)", Icon: Waves },
              { key: "Lake" as const, title: "Lake / Reservoir", sub: "USGS gauges with water level (ft)", Icon: Droplets },
              { key: "Tidal" as const, title: "Saltwater / Tidal", sub: "NOAA tide predictions, no USGS gauge", Icon: Anchor },
            ]).map(({ key, title, sub, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setWaterType(key);
                  setWaterInput("");
                  setIsUsgsWater(false);
                  setSelectedUsgs(null);
                  setNearbyUsgs([]);
                  setStep(stateCode ? "water" : "state");
                }}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                  waterType === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <Icon className="w-6 h-6 text-primary shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
              </button>
            ))}
          </div>
        )}

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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {waterType === "Tidal" ? <Anchor className="w-3.5 h-3.5 text-primary" /> : waterType === "Lake" ? <Droplets className="w-3.5 h-3.5 text-primary" /> : <Waves className="w-3.5 h-3.5 text-primary" />}
              {waterType === "Tidal" ? "Saltwater / Tidal" : waterType === "Lake" ? "Lake / Reservoir" : "Stream / River"}
              <button type="button" className="text-[10px] underline" onClick={() => setStep("type")}>change</button>
            </div>

            <div className="space-y-1 relative">
              <label className="text-sm font-medium text-foreground">Water body name</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={waterType === "Tidal" ? "e.g. Barnegat Bay, Pamlico Sound..." : "Type to search or enter a custom name..."}
                  value={waterInput}
                  onChange={(e) => handleWaterInputChange(e.target.value)}
                  onFocus={() => waterType !== "Tidal" && waterInput.trim().length >= 2 && setShowSuggestions(true)}
                  className="rounded-xl pl-9"
                  autoFocus
                />
              </div>
              {waterType === "Tidal" ? (
                <p className="text-xs text-muted-foreground">
                  Tide data comes from the nearest NOAA station — no USGS gauge needed.
                </p>
              ) : isUsgsWater ? (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> USGS monitored ({waterType === "Stream" ? "flow" : "water level"})
                </p>
              ) : waterInput.trim().length > 0 ? (
                <p className="text-xs text-muted-foreground">Custom water body (no USGS data)</p>
              ) : null}

              {waterType !== "Tidal" && showSuggestions && suggestions.length > 0 && (
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


        {step === "naming" && (
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
              {waterType === "Tidal" && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Anchor className="w-3 h-3 text-primary shrink-0" />
                  {resolvingTide ? (
                    "Finding nearest NOAA tide station..."
                  ) : tideStation?.available ? (
                    <span>
                      {tideStation.stationName} ({tideStation.stationId})
                      {tideStation.distanceMiles != null && ` · ${tideStation.distanceMiles.toFixed(1)} mi`}
                    </span>
                  ) : (
                    "No NOAA tide station within range"
                  )}
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

/* ─── Full-Screen USGS Selection Step ─── */

const FullScreenUsgsStep = ({
  apiKey, userPins, usgsLocations, selectedUsgs, setSelectedUsgs, loadingUsgs,
  waterName, stateName, onBack, onFinish,
}: {
  apiKey: string | null;
  userPins: SpotPoint[];
  usgsLocations: UsgsLocation[];
  selectedUsgs: UsgsLocation | null;
  setSelectedUsgs: (u: UsgsLocation | null) => void;
  loadingUsgs: boolean;
  waterName: string;
  stateName: string;
  onBack: () => void;
  onFinish: () => void;
}) => {
  const { isLoaded } = useGoogleMaps(apiKey);
  const localMapRef = useRef<google.maps.Map | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);

  const onLoad = useCallback((map: google.maps.Map) => {
    localMapRef.current = map;
    const bounds = new google.maps.LatLngBounds();
    if (userPins.length > 0) bounds.extend({ lat: userPins[0].latitude, lng: userPins[0].longitude });
    usgsLocations.forEach((l) => {
      if (l.latitude && l.longitude) bounds.extend({ lat: l.latitude, lng: l.longitude });
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 80);
  }, [userPins, usgsLocations]);

  useEffect(() => {
    if (!localMapRef.current) return;
    localMapRef.current.setMapTypeId(isSatellite ? "satellite" : "roadmap");
  }, [isSatellite]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/50 safe-area-top">
        <div className="px-3 pt-2 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Link Monitoring Station</p>
              <p className="text-xs text-muted-foreground">{waterName} · {stateName}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Select a USGS station for water flow data. Tap a numbered marker or button below.
          </p>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        {apiKey && isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            onLoad={onLoad}
            options={{ gestureHandling: "greedy", zoomControl: true, mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}
          >
            {/* Show only first user pin as a fish icon */}
            {userPins.length > 0 && (
              <Marker
                key="fish-pin"
                position={{ lat: userPins[0].latitude, lng: userPins[0].longitude }}
                title={userPins[0].label}
                icon={{
                  url: FISHING_ROD_PIN_ICON,
                  scaledSize: new google.maps.Size(54, 66),
                  anchor: new google.maps.Point(27, 66),
                }}
                zIndex={10}
              />
            )}
            {usgsLocations.map((loc, idx) => (
              loc.latitude && loc.longitude && (
                <Marker
                  key={`usgs-${loc.site_id}`}
                  position={{ lat: loc.latitude, lng: loc.longitude }}
                  title={`${idx + 1}: ${loc.monitoring_location_name}`}
                  icon={{
                    url: "data:image/svg+xml," + encodeURIComponent(
                      `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
                        <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z" fill="${selectedUsgs?.site_id === loc.site_id ? '#F59E0B' : USGS_FLAG_COLORS[idx] || '#718096'}" stroke="white" stroke-width="2"/>
                        <text x="18" y="22" text-anchor="middle" fill="white" font-size="15" font-weight="bold" font-family="Arial">${idx + 1}</text>
                      </svg>`
                    ),
                    scaledSize: new google.maps.Size(36, 44),
                    anchor: new google.maps.Point(18, 44),
                  }}
                  zIndex={selectedUsgs?.site_id === loc.site_id ? 100 : 50}
                  onClick={() => setSelectedUsgs(selectedUsgs?.site_id === loc.site_id ? null : loc)}
                />
              )
            ))}
          </GoogleMap>
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            {loadingUsgs ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <span className="text-sm text-muted-foreground">Map unavailable</span>}
          </div>
        )}
      </div>

      {/* Bottom panel with station list */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-md border-t border-border/50 safe-area-bottom">
        <div className="px-3 pt-2 pb-3 space-y-2">
          {loadingUsgs ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {usgsLocations.map((loc, idx) => (
                <button
                  key={loc.site_id}
                  type="button"
                  className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                    selectedUsgs?.site_id === loc.site_id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                  onClick={() => setSelectedUsgs(selectedUsgs?.site_id === loc.site_id ? null : loc)}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: selectedUsgs?.site_id === loc.site_id ? '#F59E0B' : USGS_FLAG_COLORS[idx] || "#718096" }}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{loc.monitoring_location_name}</p>
                      {loc.available_params && loc.available_params.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {loc.available_params.map((p) => (
                            <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={onBack}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              variant={isSatellite ? "default" : "outline"}
              size="sm"
              className="rounded-xl text-xs px-2.5"
              onClick={() => setIsSatellite(!isSatellite)}
            >
              {isSatellite ? "Map" : "Satellite"}
            </Button>
            <Button size="sm" className="rounded-xl gap-1" onClick={onFinish}>
              {selectedUsgs ? "Next" : "Skip"} <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
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
  const { isLoaded } = useGoogleMaps(apiKey);
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
