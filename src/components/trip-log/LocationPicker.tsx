import { useState, useCallback, useEffect, useRef } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, Search } from "lucide-react";
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

const MapView = ({
  apiKey,
  location,
  onMapClick,
  mapRef,
}: {
  apiKey: string;
  location: { lat: number; lng: number } | null;
  onMapClick: (e: google.maps.MapMouseEvent) => void;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
}) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, id: "google-map-script" });

  const handleLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, [mapRef]);

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
      onLoad={handleLoad}
      options={{ disableDefaultUI: true, zoomControl: true, mapTypeControl: false, streetViewControl: false }}
    >
      {location && <Marker position={location} />}
    </GoogleMap>
  );
};

const LocationPicker = ({ location, locationName, onLocationChange, onLocationNameChange }: LocationPickerProps) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    supabase.functions.invoke("google-maps-key").then(({ data, error }) => {
      if (!error && data?.key) setApiKey(data.key);
      setLoading(false);
    });
  }, []);

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        onLocationChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    },
    [onLocationChange]
  );

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onLocationChange(loc);
        mapRef.current?.panTo(loc);
        mapRef.current?.setZoom(13);
      },
      () => {}
    );
  };

  const handleSearch = () => {
    if (!locationName.trim() || !window.google) return;
    setSearching(true);
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: locationName.trim() }, (results, status) => {
      setSearching(false);
      if (status === "OK" && results && results[0]) {
        const loc = {
          lat: results[0].geometry.location.lat(),
          lng: results[0].geometry.location.lng(),
        };
        onLocationChange(loc);
        mapRef.current?.panTo(loc);
        mapRef.current?.setZoom(13);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Location</label>
      <div className="flex gap-2">
        <Input
          placeholder="e.g. Lake Fork, TX"
          value={locationName}
          onChange={(e) => onLocationNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="rounded-xl flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl shrink-0"
          onClick={handleSearch}
          disabled={!locationName.trim() || searching || !apiKey}
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>
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
        <MapView apiKey={apiKey} location={location} onMapClick={handleMapClick} mapRef={mapRef} />
      ) : (
        <div className="h-[240px] rounded-xl bg-muted flex items-center justify-center text-sm text-muted-foreground">
          Map unavailable — enter location manually
        </div>
      )}
    </div>
  );
};

export default LocationPicker;
