// Car-audio + CLVisit trip-start triggers. The car-audio connect now only
// logs which car (carBluetooth.ts); its wake is off, see below. Both are
// independent of CoreMotion (whose latency loses short trips). When either fires, we wake RNBG into
// continuous tracking via wakeNativeTracking — the recording still only opens on
// a real driving-speed fix (the speed backstop), so these never create a false
// trip; they just get the engine delivering location from the first metre.
//
// Everything here is fail-safe: the native modules are guarded (no-op when the
// build doesn't include them), and any error is swallowed — this can only help
// detection, never break it.
import { Platform } from "react-native";
import {
  addCarConnectionListener,
  isCarAudioAvailable,
} from "../../modules/car-audio";
import { isCarBluetoothOn, readConnectedOutputs, recordCarSighting } from "../vehicles/carBluetooth";
import {
  addVisitListener,
  startVisitMonitoring,
  stopVisitMonitoring,
  isVisitMonitorAvailable,
} from "../../modules/visit-monitor";
import { wakeNativeTracking } from "./nativeLocation";
import { isDriveDetectionEnabled, logDetectionEvent } from "./detection";

// Off: the car-audio module never shipped before, so this wake never ran.
// Needs Anthony's OK, and would only ever be iPhone.
const CAR_CONNECT_WAKES_RECORDING = false;

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
    carUnsub = addCarConnectionListener((out) => {
      // Note which car (lib/vehicles/carBluetooth.ts), on both phones.
      // Nothing is read unless this driver is a tester (the flag is cached).
      void isCarBluetoothOn()
        .then((on) => {
          if (!on) return;
          // The full list when there is one: on Android a speaker connecting
          // alongside the car must not hide it.
          const all = readConnectedOutputs();
          return recordCarSighting(all.length > 0 ? all : out, "connect");
        })
        .catch(() => {
          // never throw out of a native event callback
        });
      if (CAR_CONNECT_WAKES_RECORDING && Platform.OS === "ios") {
        void handleExternalTrigger("car_connected");
      }
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
