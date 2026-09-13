// Step count over a finished trip's window (13 Sep 2026).
//
// Corroborating evidence for walk detection. The primary signal is the motion
// coprocessor's own classification, captured per fix (see utils/walk.ts); this
// covers the case where that classification is missing but the platform can
// still say how many steps were taken, which happens on traces captured by the
// JS engine rather than the native one.
//
// iOS ONLY, and deliberately so. CMPedometer answers a HISTORICAL query
// (queryPedometerData from/to), which is what makes this usable at finalize:
// nothing has to be subscribed during the drive, and it works from the
// background. Android's expo-sensors implementation throws
// NotSupportedException for a date range, so this returns null there and the
// verdict falls back to geometry.
//
// Permission is the same iOS "Motion & Fitness" grant the tracking engine
// already asks for and depends on, so this adds no new prompt. A denied
// permission reports zero steps, which is why every caller must treat zero as
// "no evidence" and never as evidence of driving.

import { Platform } from "react-native";

let Pedometer: unknown = null;
let loadAttempted = false;

function load(): unknown {
  if (loadAttempted) return Pedometer;
  loadAttempted = true;
  try {
    Pedometer = (require("expo-sensors") as { Pedometer?: unknown }).Pedometer ?? null;
  } catch {
    // Expo Go / a build that doesn't bundle the native module.
    Pedometer = null;
  }
  return Pedometer;
}

/**
 * Steps recorded between two instants, or null when the platform cannot say.
 *
 * Null and zero mean different things and must stay distinguishable: null is
 * "no pedometer here", zero is "the pedometer counted nothing", and only the
 * second is (weak) evidence about what happened.
 */
export async function getStepsBetween(
  start: Date,
  end: Date
): Promise<number | null> {
  if (Platform.OS !== "ios") return null;
  const P = load() as
    | { getStepCountAsync?: (s: Date, e: Date) => Promise<{ steps?: number }> }
    | null;
  if (!P || typeof P.getStepCountAsync !== "function") return null;

  // CMPedometer keeps only the last seven days. Asking for more returns what
  // it has rather than failing, but there is no point asking.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - start.getTime() > SEVEN_DAYS_MS) return null;
  if (!(end.getTime() > start.getTime())) return null;

  try {
    const res = await P.getStepCountAsync(start, end);
    const steps = res?.steps;
    return typeof steps === "number" && Number.isFinite(steps) && steps >= 0
      ? steps
      : null;
  } catch {
    // Permission denied, unavailable hardware, or a range the OS rejected.
    return null;
  }
}
