// Car-audio + CLVisit trip-start triggers. Both are independent of CoreMotion
// (whose latency loses short trips). When either fires, we wake RNBG into
// continuous tracking via wakeNativeTracking — the recording still only opens on
// a real driving-speed fix (the speed backstop), so these never create a false
// trip; they just get the engine delivering location from the first metre.
//
// Everything here is fail-safe: the native modules are guarded (no-op when the
// build doesn't include them), and any error is swallowed — this can only help
// detection, never break it.
import {
  addCarConnectionListener,
  isCarAudioAvailable,
} from "../../modules/car-audio";
import {
  addVisitListener,
  startVisitMonitoring,
  stopVisitMonitoring,
  isVisitMonitorAvailable,
} from "../../modules/visit-monitor";
import { wakeNativeTracking } from "./nativeLocation";
import { isDriveDetectionEnabled, logDetectionEvent } from "./detection";

let carUnsub: (() => void) | null = null;
let visitUnsub: (() => void) | null = null;

async function handleExternalTrigger(reason: string): Promise<void> {
  try {
    if (!(await isDriveDetectionEnabled())) return;
    // Only the native engine uses changePace; the JS path has its own geofence.
    const { isNativeLocationEngineEnabled } = await import("./nativeEngineFlag");
    if (!(await isNativeLocationEngineEnabled())) return;
    const db = await (await import("../db/index")).getDatabase();
    const shift = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    if (shift) return; // a shift owns GPS
    logDetectionEvent("external_trigger", { reason }).catch(() => {});
    await wakeNativeTracking(reason);
  } catch {
    // never throw out of a native event callback
  }
}

/** Arm the car-audio + CLVisit triggers. Idempotent; safe to call repeatedly. */
export function startCarAndVisitTriggers(): void {
  if (isCarAudioAvailable() && !carUnsub) {
    carUnsub = addCarConnectionListener(() => {
      void handleExternalTrigger("car_connected");
    });
  }
  if (isVisitMonitorAvailable() && !visitUnsub) {
    startVisitMonitoring();
    visitUnsub = addVisitListener((e) => {
      if (e.type === "departure") void handleExternalTrigger("visit_departure");
    });
  }
}

/** Tear the triggers down (e.g. when the native engine is disabled). */
export function stopCarAndVisitTriggers(): void {
  if (carUnsub) {
    carUnsub();
    carUnsub = null;
  }
  if (visitUnsub) {
    visitUnsub();
    visitUnsub = null;
    stopVisitMonitoring();
  }
}
