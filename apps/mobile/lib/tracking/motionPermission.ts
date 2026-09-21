// Motion & Fitness permission (CMMotionActivityManager / CMPedometer share the
// single iOS "Motion & Fitness" permission). The native location engine's
// CoreMotion start-detection depends on it — without it RNBG falls back to the
// slower geofence path and misses short trips (Anthony's office no-show, 3 Jun;
// Richard Hudson's "Motion & Fitness not available" report).
//
// On Android the same call asks for Physical activity (ACTIVITY_RECOGNITION),
// which feeds the same start-of-drive signal.
//
// "undetermined" means the phone has never been asked, and until 21 Sep 2026
// the only place that asked was starting a shift - which 474 of 626 drivers
// never do. 41 Android diagnostic dumps that day: granted on 22 phones,
// undetermined on 14, denied on 5. The primer on the dashboard and the setup
// checklist row now ask too, so callers must treat "undetermined" as a state
// to act on rather than folding it in with "granted".
//
// Read/requested via expo-sensors' Pedometer permission API. Guarded with a
// lazy require + try/catch so it no-ops on builds that don't bundle the native
// module (OTA-only / build 72 and earlier), returning "unavailable" there and
// working once a build includes expo-sensors.

export type MotionPermission =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable";

let Pedometer: any = null;
let loadAttempted = false;

function load(): unknown {
  if (loadAttempted) return Pedometer;
  loadAttempted = true;
  try {
    Pedometer = require("expo-sensors").Pedometer;
  } catch {
    Pedometer = null;
  }
  return Pedometer;
}

function normalise(res: { granted?: boolean; status?: string } | null): MotionPermission {
  if (!res) return "unavailable";
  if (res.granted) return "granted";
  if (res.status === "denied") return "denied";
  return "undetermined";
}

/** Current Motion & Fitness permission state (no prompt). */
export async function getMotionPermission(): Promise<MotionPermission> {
  const P = load();
  if (!P || typeof (P as any).getPermissionsAsync !== "function") return "unavailable";
  try {
    return normalise(await (P as any).getPermissionsAsync());
  } catch {
    return "unavailable";
  }
}

/** Prompt for Motion & Fitness if not yet decided; returns the resulting state. */
export async function requestMotionPermission(): Promise<MotionPermission> {
  const P = load();
  if (!P || typeof (P as any).requestPermissionsAsync !== "function") return "unavailable";
  try {
    return normalise(await (P as any).requestPermissionsAsync());
  } catch {
    return "unavailable";
  }
}
