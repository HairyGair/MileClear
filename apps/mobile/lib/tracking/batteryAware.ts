// Battery awareness. Two jobs:
//   1. Read the device battery snapshot (level / charging / Low Power Mode) for
//      diagnostics — answering "is MileClear actually light on battery?".
//   2. Decide whether to ease off the PARKED low-power backstop when the battery
//      is critically low and unplugged ("battery saver"). This only ever widens
//      the parked backstop's wake interval — it NEVER touches an active recording
//      or drops a trip, so capture reliability is unaffected.
//
// SAFETY: expo-battery is loaded via lazy require() in a try/catch so an
// accidental OTA to a binary that predates the dependency degrades gracefully
// (snapshot returns nulls, saver never activates) instead of crashing.
import { getDatabase } from "../db/index";

interface BatteryModule {
  getBatteryLevelAsync: () => Promise<number>; // 0..1, -1 if unknown
  getBatteryStateAsync: () => Promise<number>; // 0 unknown,1 unplugged,2 charging,3 full
  isLowPowerModeEnabledAsync: () => Promise<boolean>;
}

let battery: BatteryModule | null = null;
let loadAttempted = false;
function getBattery(): BatteryModule | null {
  if (loadAttempted) return battery;
  loadAttempted = true;
  try {
    battery = require("expo-battery") as BatteryModule;
  } catch {
    battery = null;
  }
  return battery;
}

export interface BatterySnapshot {
  level: number | null; // 0..1
  charging: boolean | null;
  lowPowerMode: boolean | null;
}

export async function getBatterySnapshot(): Promise<BatterySnapshot> {
  const b = getBattery();
  if (!b) return { level: null, charging: null, lowPowerMode: null };
  try {
    const [level, state, lpm] = await Promise.all([
      b.getBatteryLevelAsync(),
      b.getBatteryStateAsync(),
      b.isLowPowerModeEnabledAsync(),
    ]);
    return {
      level: level >= 0 ? level : null,
      charging: state === 2 || state === 3, // charging or full
      lowPowerMode: lpm,
    };
  } catch {
    return { level: null, charging: null, lowPowerMode: null };
  }
}

const SAVER_KEY = "battery_saver_enabled";
// Below this, unplugged, with saver on → ease off the parked backstop.
export const BATTERY_SAVER_LEVEL = 0.2;

export async function isBatterySaverEnabled(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [SAVER_KEY]
    );
    return row ? row.value === "1" : true; // default ON — only bites at low battery
  } catch {
    return true;
  }
}

export async function setBatterySaverEnabled(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [SAVER_KEY, enabled ? "1" : "0"]
  );
}

/**
 * True when we should ease off the parked backstop: saver on, battery known and
 * at/under the threshold, and not charging. Conservative — any unknown returns
 * false so we never throttle on bad data.
 */
export async function isBatterySaverActive(): Promise<boolean> {
  if (!(await isBatterySaverEnabled())) return false;
  const snap = await getBatterySnapshot();
  if (snap.level == null || snap.charging == null) return false;
  return snap.level <= BATTERY_SAVER_LEVEL && snap.charging === false;
}
