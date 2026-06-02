// Feature flag for the native location engine (see nativeLocation.ts).
//
// Default OFF. The fleet stays on the existing expo-location detection path
// until a device explicitly opts in via tracking_state. Rollout plan:
// Anthony's device first (toggle on) → testers → fleet. Flag-off is an instant,
// zero-risk rollback — nothing native runs and detection falls back to JS.

import { getDatabase } from "../db/index";

const FLAG_KEY = "native_location_engine";

/** Whether this device has opted into the native engine. Cheap SQLite read;
 *  defaults to false (the safe, current behaviour). */
export async function isNativeLocationEngineEnabled(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [FLAG_KEY]
    );
    return row?.value === "1";
  } catch {
    return false;
  }
}

/** Toggle the native engine for this device (wired to a hidden Profile/debug
 *  switch for the staged rollout). */
export async function setNativeLocationEngineEnabled(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [FLAG_KEY, enabled ? "1" : "0"]
  );
}
