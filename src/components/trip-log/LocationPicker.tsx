import { useState, useCallback, useEffect } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const mapContainerStyle = { width: "100%", height: "240px", borderRadius: "0.75rem" };
const defaultCenter = { lat: 32.87, lng: -97.34 };

interface LocationPickerProps {
  location: { lat: number; lng: number } | null;
  locationName: string;
  onLocationChange: (loc: { lat: number; lng: number } | null) => void;
  onLocationNameChange: (name: string) => void;
}

/** Inner component only mounted once we have a valid API key */
const MapView = ({ apiKey, location, onMapClick }: { apiKey: string; location: { lat: number; lng: number } | null; onMapClick: (e: google.maps.MapMouseEvent) => void }) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, id: "google-map-script" });

  if (!isLoaded) {
    return (
      <div className="h-[240px] rounded-xl bg-muted flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={location ?? defaultCenter}
      zoom={location ? 13 : 6}
      onClick={onMapClick}
      options={{ disableDefaultUI: true, zoomControl: true, mapTypeControl: false, streetViewControl: false }}
    >
      {location && <Marker position={location} />}
    </GoogleMap>
  );
};

const LocationPicker = ({ location, locationName, onLocationChange, onLocationNameChange }: LocationPickerProps) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
      setLoading(false);
    });
  }, []);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      onLocationChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, [onLocationChange]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onLocationChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Location</label>
      <Input
        placeholder="e.g. Lake Fork, TX"
        value={locationName}
        onChange={(e) => onLocationNameChange(e.target.value)}
        className="rounded-xl"
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={handleLocateMe}>
          <MapPin className="w-3.5 h-3.5" /> Use my location
        </Button>
      </div>
      {loading ? (
        <div className="h-[240px] rounded-xl bg-muted flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : apiKey ? (
        <MapView apiKey={apiKey} location={location} onMapClick={handleMapClick} />
      ) : (
        <div className="h-[240px] rounded-xl bg-muted flex items-center justify-center text-sm text-muted-foreground">
          Map unavailable — enter location manually
        </div>
      )}
    </div>
  );
};

export default LocationPicker;
