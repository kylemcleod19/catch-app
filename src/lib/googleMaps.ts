import { useEffect, useState } from "react";

/**
 * Single source of truth for the Google Maps JS loader.
 *
 * We inject the script ourselves (instead of useJsApiLoader) because the
 * upstream Loader throws "Loader must not be called again with different
 * options" whenever a component mounts before its API key has been fetched
 * (empty key first, real key after).
 */
export const GOOGLE_MAPS_LIBRARIES: ("places")[] = ["places"];
export const GOOGLE_MAPS_SCRIPT_ID = "google-map-script";

let loadPromise: Promise<void> | null = null;

const loadGoogleMaps = (apiKey: string): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=${GOOGLE_MAPS_LIBRARIES.join(",")}&v=weekly&language=en&region=US`;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
};

export const useGoogleMaps = (apiKey: string | null | undefined) => {
  const [isLoaded, setIsLoaded] = useState<boolean>(
    () => typeof window !== "undefined" && !!(window as any).google?.maps,
  );
  const [loadError, setLoadError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    if (!apiKey || isLoaded) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (!cancelled) setIsLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err as Error);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, isLoaded]);

  return { isLoaded, loadError };
};
