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
// It does one more thing since 9 Sep 2026 (Jenny Hyett-Bell's Galaxy S25+):
// when a headless location fix is a confident driving-speed fix and the SDK
// still says stationary, wake it into tracking. The re-arm above acquires one
// position per heartbeat; on Samsung the stationary geofence exit never came,
// so a 50 mph fix arrived here and was discarded because the speed backstop
// lives only in the foreground code. Now it opens tracking; the native store
// keeps the fixes and the next app open reconciles them into a trip.
//
// And since 15 Sep 2026 it finishes the trip at the kerb. The Android audit
// that day found distances right but delivery late: median 90 minutes from
// trip end to server (iOS 12), 34% over six hours late (iOS 10%), because a
// recording opened while the app was alive was only ever finalised at the
// next app open once Android had ended the app. The SDK's parked
// `motionchange {isMoving:false}` reached this task, which ignored it. Now,
// with a recording open, the task hands that event to the same foreground
// stop handler (finalise, sync or queue offline, keep-alive window), and a
// headless `location` fix to the same buffering handler, so nothing about
// the verdict, distance or walk logic differs between the two contexts.
//
// Why the two contexts cannot both handle one event: the SDK routes every
// event either to the live JS listeners or to this task, by
// LifecycleManager.isHeadless. That flag is set by onActivityDestroy (the
// RN module's onHostDestroy, which also runs removeAllListeners()) and
// cleared by setActivity on onHostResume; RN itself refuses to start a
// headless task while the app is in the foreground. Inside one JS context
// finalizeAutoTrip's re-entrancy guard and syncCreateTrip's two-minute
// dedup window stand behind that.
//
// Registered from the app entry (index.js) so it exists before anything
// renders. Android-only by construction: the SDK only fires headless events
// there, and the module is required lazily so Expo Go and iOS never touch it.

import { Platform } from "react-native";
import {
  decideHeadlessWake,
  readHeadlessFix,
  HEADLESS_FORCE_START_ACCURACY_M,
  HEADLESS_FORCE_START_SPEED_MS,
} from "./headlessSpeedRule";
import { pickHeadlessLocation, readHeadlessIsMoving, routeHeadlessEvent } from "./headlessFinalizeRule";

type HeadlessEvent = { name?: string; params?: Record<string, unknown> };
type BgGeoHeadless = {
  registerHeadlessTask?: (cb: (event: HeadlessEvent) => Promise<void>) => void;
  getState?: () => Promise<{ enabled?: boolean; isMoving?: boolean }>;
  changePace?: (isMoving: boolean) => Promise<unknown>;
};

/** Re-arm at most this often from heartbeats. */
const HEARTBEAT_REARM_MS = 30 * 60 * 1000;

/**
 * 21 Sep 2026: this throttle had never once applied. It was a module variable,
 * and Android tears the headless JavaScript context down between events, so
 * every heartbeat started again from zero and re-armed. It shows in the fleet
 * dumps as 663 `native_headless_rearmed` against 130 `native_motionchange`:
 * five re-arms for every time a phone reported that anything had moved. The
 * timestamp now lives in SQLite, which survives the teardown, and the module
 * variable is kept only as a same-process fast path.
 */
const REARM_AT_KEY = "headless_rearm_at";
let lastRearmAt = 0;

async function readLastRearmAt(): Promise<number> {
  if (lastRearmAt > 0) return lastRearmAt;
  try {
    const { getDatabase } = await import("../db/index");
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [REARM_AT_KEY]
    );
    const at = row ? Number(row.value) : 0;
    return Number.isFinite(at) ? at : 0;
  } catch {
    // Unreadable means unknown, and unknown must not block a re-arm: a phone
    // that cannot read its own throttle is better off armed than adrift.
    return 0;
  }
}

async function noteRearmAt(at: number): Promise<void> {
  lastRearmAt = at;
  try {
    const { getDatabase } = await import("../db/index");
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      REARM_AT_KEY,
      String(at),
    ]);
  } catch {
    // The fast path still holds for this process.
  }
}

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
    await noteRearmAt(Date.now());
    await log?.("native_headless_rearmed", { trigger });
  } catch (err) {
    await log?.("native_headless_rearm_failed", {
      trigger,
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
  }
}

async function wakeIfDriving(BGGeo: BgGeoHeadless, name: string, params: unknown): Promise<void> {
  const fix = readHeadlessFix(name, params);
  // Cheap pre-check before touching the SDK: most fixes are slow or absent.
  if (!decideHeadlessWake({ fix, isMoving: null, enabled: null })) {
    // The near miss is the interesting one: a fix travelling at driving speed
    // that we threw away because it was not tight enough. An Android phone's
    // first fix after a cold wake is often 40 to 100 m, and on a phone whose
    // app the OS has ended this may be the only fix of the whole drive. We
    // have never logged these, so the 30 m threshold has never been judged on
    // anything (21 Sep 2026). Rare by construction, so no throttle needed.
    if (
      fix?.speedMs != null &&
      fix.speedMs >= HEADLESS_FORCE_START_SPEED_MS &&
      fix.accuracyM != null &&
      fix.accuracyM > HEADLESS_FORCE_START_ACCURACY_M
    ) {
      const log = await loadLog();
      await log?.("native_headless_wake_rejected", {
        trigger: name,
        reason: "accuracy",
        speedMph: Math.round(fix.speedMs * 2.23694),
        accuracy: Math.round(fix.accuracyM),
      }).catch(() => {});
    }
    return;
  }
  // A pause is decided here too, so it can end while the app is closed: this
  // is often the only code running on an Android phone for hours. "sleep"
  // means the pause is still going, so leave the SDK parked rather than
  // waking it for a drive we are not going to record.
  try {
    const { resolvePauseOnWake } = await import("./detection");
    if ((await resolvePauseOnWake()) === "sleep") return;
  } catch {
    // Unreadable pause state must not block a recording.
  }
  let log: ((event: string, data?: Record<string, unknown>) => Promise<void>) | null = null;
  try {
    log = (await import("./detection")).logDetectionEvent;
  } catch {
    log = null;
  }
  try {
    const state = typeof BGGeo.getState === "function" ? await BGGeo.getState() : null;
    if (!decideHeadlessWake({ fix, isMoving: state?.isMoving ?? null, enabled: state?.enabled ?? null })) return;
    if (typeof BGGeo.changePace !== "function") return;
    await BGGeo.changePace(true);
    await log?.("native_headless_force_start_from_speed", {
      trigger: name,
      speedMph: Math.round((fix?.speedMs ?? 0) * 2.23694),
      accuracy: Math.round(fix?.accuracyM ?? 0),
    });
    // Waking the SDK is not the same as opening a recording. Until 15 Sep
    // 2026 a trip that started while Android had ended the app was tracked
    // only by the SDK's own store and became a trip at the next app open.
    // Hand the same fix to the foreground handler: its speed backstop applies
    // the same guards (shift lock, Not Driving cooldown, 12 mph within 30 m)
    // and opens the recording, after which headless fixes buffer and the
    // parked event finalises at the kerb.
    const loc = pickHeadlessLocation(name, params);
    if (loc) {
      try {
        const { handleNativeLocation } = await import("./nativeLocation");
        await handleNativeLocation(loc as unknown as Parameters<typeof handleNativeLocation>[0]);
        await log?.("native_headless_recording_opened", {
          trigger: name,
          opened: await isRecordingOpen(),
        });
      } catch (err) {
        await log?.("native_headless_open_failed", {
          trigger: name,
          error: err instanceof Error ? err.message.slice(0, 120) : String(err),
        }).catch(() => {});
      }
    }
  } catch (err) {
    await log?.("native_headless_wake_failed", {
      trigger: name,
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
  }
}

type DetectionLog = (event: string, data?: Record<string, unknown>) => Promise<void>;

async function loadLog(): Promise<DetectionLog | null> {
  try {
    return (await import("./detection")).logDetectionEvent;
  } catch {
    return null;
  }
}

/** tracking_state.auto_recording_active === '1'. False when the DB is unreachable. */
async function isRecordingOpen(): Promise<boolean> {
  try {
    const { getDatabase } = await import("../db/index");
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    return row?.value === "1";
  } catch {
    return false;
  }
}

/** How many fixes the route holds right now: the JS buffer and the SDK's own store. */
async function routeSize(): Promise<{ jsCoords: number; nativeCoords: number | null }> {
  let jsCoords = 0;
  let nativeCoords: number | null = null;
  try {
    const { getDatabase } = await import("../db/index");
    const db = await getDatabase();
    jsCoords = (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM detection_coordinates"))?.n ?? 0;
  } catch {}
  try {
    const { getNativeStoreSummary } = await import("./nativeLocation");
    nativeCoords = (await getNativeStoreSummary())?.count ?? null;
  } catch {}
  return { jsCoords, nativeCoords };
}

/**
 * The car has parked with a recording open and the app is not running:
 * finalise here, through the foreground stop handler, instead of waiting for
 * the next app open. Events prove it fleet-wide: started / done / failed.
 */
async function finalizeHeadless(params: unknown): Promise<void> {
  const log = await loadLog();
  const startedAt = Date.now();
  const before = await routeSize();
  await log?.("native_headless_finalize_started", before);
  try {
    const { handleNativeMotionChange } = await import("./nativeLocation");
    // The SDK's motionchange JSON is the same object the live listener gets.
    await handleNativeMotionChange(params as Parameters<typeof handleNativeMotionChange>[0]);
    const { readPersistedLastSavedTrip } = await import("../events/lastTrip");
    const last = await readPersistedLastSavedTrip();
    const saved = !!last && last.savedAt >= startedAt;
    await log?.("native_headless_finalize_done", {
      distance: saved ? last!.distanceMiles : null,
      coords: Math.max(before.jsCoords, before.nativeCoords ?? 0),
      saved,
      // Still armed afterwards = a multileg deferral, or the handler stood
      // down (detection off, a shift owns GPS, or it logged
      // native_motionchange_error); the next app open still covers it.
      stillArmed: await isRecordingOpen(),
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    await log?.("native_headless_finalize_failed", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
      ms: Date.now() - startedAt,
    }).catch(() => {});
  }
}

/** A headless fix while a recording is open: buffer it as the live listener would. */
async function bufferHeadless(params: unknown): Promise<void> {
  try {
    const { handleNativeLocation } = await import("./nativeLocation");
    await handleNativeLocation(params as Parameters<typeof handleNativeLocation>[0]);
  } catch {
    // handleNativeLocation never throws; the SDK's own store still holds the fix.
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
        if (Date.now() - (await readLastRearmAt()) >= HEARTBEAT_REARM_MS) {
          await rearmIfStationary(BGGeo!, name);
        }
      } else if (name === "location" || name === "motionchange") {
        const route = routeHeadlessEvent({
          platform: Platform.OS,
          name,
          isMoving: readHeadlessIsMoving(name, event?.params),
          recordingOpen: await isRecordingOpen(),
        });
        if (route === "finalize") {
          await finalizeHeadless(event?.params);
        } else if (route === "buffer") {
          await bufferHeadless(event?.params);
        } else if (route === "wake") {
          await wakeIfDriving(BGGeo!, name, event?.params);
        }
      }
      // Every other event (geofence, providerchange, connectivitychange,
      // http, schedule, powersavechange, activitychange) is the SDK's own
      // business; the native store keeps the fixes and the next app open
      // reconciles them.
    } catch {
      // A headless task must always resolve; the SDK finishes it either way.
    }
  });
}

registerNativeHeadlessTask();
