import { useRef, useCallback } from "react";

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10; // px

export function useLongPress(onLongPress: (e: { lat: number; lng: number }) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const latLngRef = useRef<{ lat: number; lng: number } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onMouseDown = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      latLngRef.current = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      // We get pixel position from domEvent
      const domEvent = e.domEvent as MouseEvent | TouchEvent;
      const clientX = "touches" in domEvent ? domEvent.touches[0].clientX : domEvent.clientX;
      const clientY = "touches" in domEvent ? domEvent.touches[0].clientY : domEvent.clientY;
      startPos.current = { x: clientX, y: clientY };

      cancel();
      timerRef.current = setTimeout(() => {
        if (latLngRef.current) {
          onLongPress(latLngRef.current);
        }
        timerRef.current = null;
      }, LONG_PRESS_MS);
    },
    [onLongPress, cancel]
  );

  const onMouseMove = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!timerRef.current || !startPos.current) return;
      const domEvent = e.domEvent as MouseEvent | TouchEvent;
      const clientX = "touches" in domEvent ? domEvent.touches[0]?.clientX ?? 0 : domEvent.clientX;
      const clientY = "touches" in domEvent ? domEvent.touches[0]?.clientY ?? 0 : domEvent.clientY;
      const dx = clientX - startPos.current.x;
      const dy = clientY - startPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
        cancel();
      }
    },
    [cancel]
  );

  const onMouseUp = useCallback(() => {
    cancel();
  }, [cancel]);

  return { onMouseDown, onMouseMove, onMouseUp };
}
