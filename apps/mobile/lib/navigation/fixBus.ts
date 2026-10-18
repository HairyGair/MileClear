// How navigation gets GPS fixes: a tiny in-app event fed by the trip
// recorder, so there is exactly one GPS source.
//
// Why not its own location listener: startNativeLocationEngine() calls
// BGGeo.removeAllListeners() and re-registers only its own, so a second
// onLocation listener would be dropped silently the next time the engine
// starts. Starting, stopping or reconfiguring the engine for navigation is
// ruled out too (trip capture comes first, docs/navigation-build-oct2026.md).
// So handleNativeLocation (lib/tracking/nativeLocation.ts) hands each fix to
// offerFix() before it does anything else, the expo-location task (shifts and
// Start Trip, lib/tracking/index.ts) does the same with the newest fix of each
// batch, and this passes them on. The foreground bridge (fixBridge.ts) adds
// its own fixes with emitBridgeFix() only while the recorder is silent.
//
// offerFix() must never get in the recorder's way:
//   - nobody listening (the normal case) costs one Set size check;
//   - listeners run on a later tick (setTimeout 0), so the recorder's own work
//     on the fix is never delayed by guidance, and nothing a listener throws
//     can reach the recorder's stack;
//   - the conversion itself is wrapped, and offerFix() never throws.

import type { FixSource, NavFix } from "./navigator";

type Listener = (fix: NavFix) => void;

const listeners = new Set<Listener>();
let latest: NavFix | null = null;
/** When the recorder (not the bridge) last delivered a fix, while listening. */
let lastRecorderAtMs: number | null = null;

/** The shape handleNativeLocation receives (a subset of RNBG's Location). */
export interface RecorderFix {
  coords: {
    latitude: number;
    longitude: number;
    speed?: number | null;
    accuracy?: number | null;
    heading?: number | null;
  };
  timestamp?: string | number | null;
}

export function toNavFix(loc: RecorderFix, nowMs: number = Date.now(), source?: FixSource): NavFix | null {
  const c = loc?.coords;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  let atMs = nowMs;
  if (typeof loc.timestamp === "number" && Number.isFinite(loc.timestamp)) atMs = loc.timestamp;
  else if (typeof loc.timestamp === "string") {
    const t = Date.parse(loc.timestamp);
    if (Number.isFinite(t)) atMs = t;
  }
  const speed = num(c.speed);
  const heading = num(c.heading);
  return {
    lat: c.latitude,
    lng: c.longitude,
    speedMps: speed != null && speed >= 0 ? speed : null,
    accuracyM: num(c.accuracy),
    headingDeg: heading != null && heading >= 0 ? heading : null,
    atMs,
    ...(source ? { source } : {}),
  };
}

/** True while something (the navigation screen) wants fixes. */
export function hasFixListeners(): boolean {
  return listeners.size > 0;
}

function deliver(fix: NavFix): void {
  latest = fix;
  setTimeout(() => {
    for (const l of Array.from(listeners)) {
      try {
        l(fix);
      } catch {
        // a guidance bug must not stop the other listeners
      }
    }
  }, 0);
}

/**
 * Called by the recorder for every fix ("native": handleNativeLocation,
 * "task": the expo-location task). Cheap no-op when nobody listens; never
 * throws; never runs a listener synchronously.
 */
export function offerFix(loc: RecorderFix, source: FixSource = "native"): void {
  if (listeners.size === 0) return;
  try {
    const fix = toNavFix(loc, Date.now(), source);
    if (!fix) return;
    lastRecorderAtMs = Date.now();
    deliver(fix);
  } catch {
    // never into the recorder
  }
}

/** The foreground bridge's fixes. Not counted as the recorder's. */
export function emitBridgeFix(loc: RecorderFix): void {
  if (listeners.size === 0) return;
  try {
    const fix = toNavFix(loc, Date.now(), "bridge");
    if (fix) deliver(fix);
  } catch {
    // best effort
  }
}

/** When the recorder last delivered a fix (null: not since listening began). */
export function lastRecorderFixAt(): number | null {
  return lastRecorderAtMs;
}

/** Listen for fixes. Returns the unsubscribe. */
export function subscribeToFixes(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      latest = null;
      lastRecorderAtMs = null;
    }
  };
}

/** The newest fix seen while someone was listening, if not older than maxAgeMs. */
export function latestFix(maxAgeMs: number, nowMs: number = Date.now()): NavFix | null {
  if (!latest) return null;
  return nowMs - latest.atMs <= maxAgeMs ? latest : null;
}

/** Tests only. */
export function _resetFixBus(): void {
  listeners.clear();
  latest = null;
  lastRecorderAtMs = null;
}
