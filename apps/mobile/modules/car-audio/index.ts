// JS interface for the CarAudio native module (iPhone and Android). Guarded:
// requireNativeModule throws when the native binary isn't present (Expo Go,
// OTA-only / older builds), so we wrap it and expose a safe API that no-ops
// there. Nothing here ever throws into the caller.
import { NativeModule, requireNativeModule } from "expo-modules-core";

export type CarAudioKind = "bluetooth" | "carplay" | "android_auto" | "usb" | "other";

export interface CarAudioOutput {
  /** What the car calls itself, e.g. "MY FORD". Trimmed, never empty. */
  name: string;
  /**
   * Stable per device where the OS gives one: the Bluetooth address masked
   * to "XX:XX:XX:XX:EE:FF" on both phones (CarPlay's uid as given). Null if
   * none (also Android 8.1 and older).
   */
  id: string | null;
  kind: CarAudioKind;
}

type RawOutput = { name?: unknown; id?: unknown; kind?: unknown } | null | undefined;

type CarAudioEvents = {
  onCarConnected: (out: RawOutput) => void;
  onCarDisconnected: () => void;
};

declare class CarAudioNativeModule extends NativeModule<CarAudioEvents> {
  isConnectedToCar(): boolean;
  // Absent on binaries built before car Bluetooth (24 Oct 2026).
  currentCarAudio?: () => RawOutput;
  currentCarAudioOutputs?: () => RawOutput[];
  hasOutputsApi?: () => boolean;
}

const KINDS: readonly CarAudioKind[] = ["bluetooth", "carplay", "android_auto", "usb", "other"];

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

// Native payloads are checked here so callers get the contract's shape or
// null, whatever an older or odd binary sends.
function toOutput(raw: RawOutput): CarAudioOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  const kind = KINDS.includes(raw.kind as CarAudioKind) ? (raw.kind as CarAudioKind) : "other";
  return { name, id, kind };
}

/** True only when the native CarAudio module is present in this build. */
export function isCarAudioAvailable(): boolean {
  return load() !== null;
}

/**
 * True only when this build's native side can say which car it is (names
 * and ids, both phones). False on Expo Go, OTA-only phones and binaries with
 * the older iPhone-only module, which could only say "a car".
 */
export function isCarOutputsAvailable(): boolean {
  const m = load();
  if (!m || typeof m.hasOutputsApi !== "function") return false;
  try {
    return m.hasOutputsApi() === true;
  } catch {
    return false;
  }
}

/** Synchronous check: is the phone currently on a car audio output? */
export function isConnectedToCar(): boolean {
  const m = load();
  try {
    return m ? m.isConnectedToCar() : false;
  } catch {
    return false;
  }
}

/**
 * The car audio output the phone is on now, or null (none, no name, or a
 * build without this function). Synchronous and cheap.
 */
export function currentCarAudio(): CarAudioOutput | null {
  const m = load();
  if (!m) return null;
  // Same answer as the first of currentCarAudioOutputs() where the build has
  // the list (it also skips a nameless first output).
  if (typeof m.currentCarAudioOutputs === "function") return currentCarAudioOutputs()[0] ?? null;
  return singleOutput(m);
}

function singleOutput(m: CarAudioNativeModule): CarAudioOutput | null {
  if (typeof m.currentCarAudio !== "function") return null;
  try {
    return toOutput(m.currentCarAudio());
  } catch {
    return null;
  }
}

/**
 * Every car-like output connected now, best first, one per name|id; [] when
 * none or the build lacks it. currentCarAudio() is the first of these. On
 * Android a second Bluetooth speaker can be listed beside the car, so match
 * linked names against all of them.
 */
export function currentCarAudioOutputs(): CarAudioOutput[] {
  const m = load();
  if (!m) return [];
  try {
    if (typeof m.currentCarAudioOutputs !== "function") {
      // A build with only the single-output call still gives its best one.
      const one = singleOutput(m);
      return one ? [one] : [];
    }
    const raw = m.currentCarAudioOutputs();
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: CarAudioOutput[] = [];
    for (const r of raw) {
      const o = toOutput(r);
      if (!o) continue;
      const key = `${o.name}|${o.id ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Subscribe to car connect/disconnect. Returns an unsubscribe function.
 * onConnected gets the car's output, or null when the binary predates the
 * payload or the output has no name. No-ops (returns a noop unsub) when the
 * module isn't available.
 */
export function addCarConnectionListener(
  onConnected: (out: CarAudioOutput | null) => void,
  onDisconnected?: () => void
): () => void {
  const m = load();
  if (!m) return () => {};
  const subs: { remove: () => void }[] = [];
  try {
    subs.push(
      m.addListener("onCarConnected", (raw) => {
        let out: CarAudioOutput | null = null;
        try {
          out = toOutput(raw);
        } catch {
          out = null;
        }
        try {
          onConnected(out);
        } catch {
          // a caller's error never reaches the native emitter
        }
      })
    );
    if (onDisconnected) {
      subs.push(
        m.addListener("onCarDisconnected", () => {
          try {
            onDisconnected();
          } catch {
            // as above
          }
        })
      );
    }
  } catch {
    // listener registration failed: whatever did register is removed below
  }
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
