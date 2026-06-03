// JS interface for the CarAudio native module. Guarded: requireNativeModule
// throws when the native binary isn't present (Expo Go, OTA-only / build 72),
// so we wrap it and expose a safe API that no-ops there.
import { NativeModule, requireNativeModule } from "expo-modules-core";

type CarAudioEvents = {
  onCarConnected: () => void;
  onCarDisconnected: () => void;
};

declare class CarAudioNativeModule extends NativeModule<CarAudioEvents> {
  isConnectedToCar(): boolean;
}

let mod: CarAudioNativeModule | null = null;
let loadAttempted = false;

function load(): CarAudioNativeModule | null {
  if (loadAttempted) return mod;
  loadAttempted = true;
  try {
    mod = requireNativeModule<CarAudioNativeModule>("CarAudio");
  } catch {
    mod = null; // not bundled in this build
  }
  return mod;
}

/** True only when the native CarAudio module is present in this build. */
export function isCarAudioAvailable(): boolean {
  return load() !== null;
}

/** Synchronous check: is the phone currently on a car audio route? */
export function isConnectedToCar(): boolean {
  const m = load();
  try {
    return m ? m.isConnectedToCar() : false;
  } catch {
    return false;
  }
}

/**
 * Subscribe to car connect/disconnect. Returns an unsubscribe function.
 * No-ops (returns a noop unsub) when the module isn't available.
 */
export function addCarConnectionListener(
  onConnected: () => void,
  onDisconnected?: () => void
): () => void {
  const m = load();
  if (!m) return () => {};
  const subs = [
    m.addListener("onCarConnected", onConnected),
    ...(onDisconnected ? [m.addListener("onCarDisconnected", onDisconnected)] : []),
  ];
  return () => {
    for (const s of subs) {
      try {
        s.remove();
      } catch {
        // best effort
      }
    }
  };
}
