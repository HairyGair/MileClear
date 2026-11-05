import { useSyncExternalStore } from "react";
import { Dimensions } from "react-native";

/**
 * Window width and height that follow the phone as it turns.
 *
 * useWindowDimensions can keep the old portrait size after a turn on iOS (the
 * 'change' event is not always sent, notably while a sheet is open), though the
 * screen itself has resized. The root view's measured size is always right, so
 * the root layout reports it here (see reportWindowSize) and layouts that depend
 * on the window's shape read it with useWindowSize. fontScale is not affected:
 * keep reading that from useWindowDimensions.
 */
type Size = { width: number; height: number };

let current: Size = (() => {
  const { width, height } = Dimensions.get("window");
  return { width, height };
})();
let measured = false;
const listeners = new Set<() => void>();

function set(next: Size) {
  if (next.width === current.width && next.height === current.height) return;
  current = next;
  listeners.forEach((l) => l());
}

/** Called from the root layout's onLayout. Once it has run, it is the only source. */
export function reportWindowSize(width: number, height: number) {
  if (!(width > 0 && height > 0)) return;
  measured = true;
  set({ width, height });
}

// Before the root has been measured, follow the system event.
Dimensions.addEventListener("change", ({ window }) => {
  if (!measured) set({ width: window.width, height: window.height });
});

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useWindowSize(): Size {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
