import { useJsApiLoader } from "@react-google-maps/api";

/**
 * Single source of truth for the Google Maps JS loader.
 * The loader throws ("Loader must not be called again with different options")
 * if any component loads the same script id with different libraries, so every
 * map in the app must go through this hook.
 */
export const GOOGLE_MAPS_LIBRARIES: ("places")[] = ["places"];
export const GOOGLE_MAPS_SCRIPT_ID = "google-map-script";

export const useGoogleMaps = (apiKey: string | null | undefined) =>
  useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    id: GOOGLE_MAPS_SCRIPT_ID,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
