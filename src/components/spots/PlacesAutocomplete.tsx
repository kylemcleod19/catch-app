import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";

interface PlacesAutocompleteProps {
  onPlaceSelected: (place: { name: string; lat: number; lng: number }) => void;
}

const PlacesAutocomplete = ({ onPlaceSelected }: PlacesAutocompleteProps) => {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const hiddenDiv = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const init = () => {
      if (window.google?.maps?.places) {
        autocompleteService.current = new google.maps.places.AutocompleteService();
        if (hiddenDiv.current) {
          placesService.current = new google.maps.places.PlacesService(hiddenDiv.current);
        }
      }
    };
    init();
    // Retry if google isn't loaded yet
    if (!window.google?.maps?.places) {
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          init();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  const search = useCallback((input: string) => {
    if (!input.trim() || !autocompleteService.current) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    autocompleteService.current.getPlacePredictions(
      { input, types: ["establishment", "geocode"] },
      (results, status) => {
        setLoading(false);
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results.slice(0, 5));
        } else {
          setPredictions([]);
        }
      }
    );
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesService.current) return;
    placesService.current.getDetails(
      { placeId: prediction.place_id, fields: ["geometry", "name"] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          const name = place.name || prediction.structured_formatting.main_text;
          onPlaceSelected({
            name,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
          setQuery(name);
          setPredictions([]);
        }
      }
    );
  };

  return (
    <div className="relative">
      <div ref={hiddenDiv} style={{ display: "none" }} />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search for a city, road, park..."
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          className="rounded-xl pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      {predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-b-0"
              onClick={() => handleSelect(p)}
            >
              <p className="text-sm font-medium text-foreground truncate">
                {p.structured_formatting.main_text}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {p.structured_formatting.secondary_text}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlacesAutocomplete;
