// Android headless handler for the native location SDK (RNBG).
//
// What the SDK's own log showed on SteveG's Honor X5C (2 Sep 2026): after
// the phone rebooted mid-drive at 15:34 the SDK came back headless - loaded
// its odometer, connected Play Services - and then did nothing. It armed no
// stationary region. Six more process births that evening did nothing
// either. The region only ever gets armed when a person opens the app,
// because until now the app registered no headless task, so a headless
// start had no JS to run and the SDK sat with its `enabled:true` flag and no
// wake trigger. On Android without ACTIVITY_RECOGNITION the stationary
// geofence is the only wake trigger there is. A dormant engine between an
// unattended restart and the next app open is a missed drive.
//
// This task runs in that headless JS context. It does one thing: when the
// SDK reports a boot, a terminate, or (rate-limited) a heartbeat while it is
// stationary, ask it to re-acquire its stationary position, which is what
// (re)arms the region. Never when the SDK thinks it is moving.
//
// Registered from the app entry (index.js) so it exists before anything
// renders. Android-only by construction: the SDK only fires headless events
// there, and the module is required lazily so Expo Go and iOS never touch it.

import { Platform } from "react-native";

type HeadlessEvent = { name?: string; params?: Record<string, unknown> };
type BgGeoHeadless = {
  registerHeadlessTask?: (cb: (event: HeadlessEvent) => Promise<void>) => void;
  getState?: () => Promise<{ enabled?: boolean; isMoving?: boolean }>;
  changePace?: (isMoving: boolean) => Promise<unknown>;
};

/** Re-arm at most this often from heartbeats within one headless process. */
const HEARTBEAT_REARM_MS = 30 * 60 * 1000;
let lastRearmAt = 0;

async function rearmIfStationary(BGGeo: BgGeoHeadless, trigger: string): Promise<void> {
  let log: ((event: string, data?: Record<string, unknown>) => Promise<void>) | null = null;
  try {
    log = (await import("./detection")).logDetectionEvent;
  } catch {
    log = null;
  }
  try {
    const state = typeof BGGeo.getState === "function" ? await BGGeo.getState() : null;
    if (state?.enabled === false) return;
    if (state?.isMoving === true) return;
    if (typeof BGGeo.changePace !== "function") return;
    await BGGeo.changePace(false);
    lastRearmAt = Date.now();
    await log?.("native_headless_rearmed", { trigger });
  } catch (err) {
    await log?.("native_headless_rearm_failed", {
      trigger,
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
  }
}

export function registerNativeHeadlessTask(): void {
  if (Platform.OS !== "android") return;
  let BGGeo: BgGeoHeadless | null = null;
  try {
    const mod = require("react-native-background-geolocation");
    BGGeo = (mod?.default ?? mod) as BgGeoHeadless;
  } catch {
    return; // Expo Go / a binary without the module
  }
  if (!BGGeo || typeof BGGeo.registerHeadlessTask !== "function") return;

  BGGeo.registerHeadlessTask(async (event) => {
    const name = String(event?.name ?? "");
    try {
      if (name === "boot" || name === "terminate") {
        await rearmIfStationary(BGGeo!, name);
      } else if (name === "heartbeat") {
        if (Date.now() - lastRearmAt >= HEARTBEAT_REARM_MS) {
          await rearmIfStationary(BGGeo!, name);
        }
      }
      // Every other event (location, motionchange, geofence, providerchange,
      // connectivitychange, http, schedule, powersavechange, activitychange)
      // is the SDK's own business; the native store keeps the fixes and the
      // next app open reconciles them.
    } catch {
      // A headless task must always resolve; the SDK finishes it either way.
    }
  });
}

registerNativeHeadlessTask();
