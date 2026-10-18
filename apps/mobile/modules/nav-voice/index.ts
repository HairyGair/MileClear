// JS side of the NavVoice native module (audio session / focus for spoken
// directions). Guarded like modules/car-audio: requireNativeModule throws on
// a binary built before 1.4.0 (every older runtime still gets main's JS by
// OTA), so this loads lazily and every call is a safe no-op there.
//
// isNavVoiceAvailable() is part of the gate for showing Directions at all:
// a binary without this module never shows the entry points.
import { NativeModule, requireNativeModule } from "expo-modules-core";

type NavVoiceEvents = {
  onInterruption: (e: { began: boolean }) => void;
};

declare class NavVoiceNativeModule extends NativeModule<NavVoiceEvents> {
  isCallActive(): boolean;
  beginPrompt(): Promise<boolean>;
  endPrompt(): Promise<void>;
}

let mod: NavVoiceNativeModule | null = null;
let loadAttempted = false;

function load(): NavVoiceNativeModule | null {
  if (loadAttempted) return mod;
  loadAttempted = true;
  try {
    mod = requireNativeModule<NavVoiceNativeModule>("NavVoice");
  } catch {
    mod = null; // not in this build
  }
  return mod;
}

export function isNavVoiceAvailable(): boolean {
  return load() !== null;
}

export function isCallActive(): boolean {
  const m = load();
  try {
    return m ? m.isCallActive() : false;
  } catch {
    return false;
  }
}

/** Duck other audio for one prompt. False: don't speak now (a call). */
export async function beginPrompt(): Promise<boolean> {
  const m = load();
  if (!m) return true;
  try {
    return await m.beginPrompt();
  } catch {
    return true;
  }
}

export async function endPrompt(): Promise<void> {
  const m = load();
  if (!m) return;
  try {
    await m.endPrompt();
  } catch {
    // best effort
  }
}

export function addInterruptionListener(cb: (began: boolean) => void): () => void {
  const m = load();
  if (!m) return () => {};
  try {
    const sub = m.addListener("onInterruption", (e) => cb(!!e?.began));
    return () => {
      try {
        sub.remove();
      } catch {
        // best effort
      }
    };
  } catch {
    return () => {};
  }
}
