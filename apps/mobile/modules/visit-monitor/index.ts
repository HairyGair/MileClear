// JS interface for the VisitMonitor native module. Guarded so it no-ops on
// builds without the native binary (Expo Go, OTA-only / build 72).
import { NativeModule, requireNativeModule } from "expo-modules-core";

export type VisitEvent = {
  type: "arrival" | "departure";
  latitude: number;
  longitude: number;
};

type VisitMonitorEvents = {
  onVisit: (event: VisitEvent) => void;
};

declare class VisitMonitorNativeModule extends NativeModule<VisitMonitorEvents> {
  startMonitoring(): void;
  stopMonitoring(): void;
}

let mod: VisitMonitorNativeModule | null = null;
let loadAttempted = false;

function load(): VisitMonitorNativeModule | null {
  if (loadAttempted) return mod;
  loadAttempted = true;
  try {
    mod = requireNativeModule<VisitMonitorNativeModule>("VisitMonitor");
  } catch {
    mod = null;
  }
  return mod;
}

export function isVisitMonitorAvailable(): boolean {
  return load() !== null;
}

export function startVisitMonitoring(): void {
  try {
    load()?.startMonitoring();
  } catch {
    // best effort
  }
}

export function stopVisitMonitoring(): void {
  try {
    load()?.stopMonitoring();
  } catch {
    // best effort
  }
}

/** Subscribe to visit events. Returns an unsubscribe function (noop if absent). */
export function addVisitListener(cb: (event: VisitEvent) => void): () => void {
  const m = load();
  if (!m) return () => {};
  const sub = m.addListener("onVisit", cb);
  return () => {
    try {
      sub.remove();
    } catch {
      // best effort
    }
  };
}
