// Feature flag for the native location engine (see nativeLocation.ts).
//
// Default ON as of 4 Jun 2026 (build 73 fleet rollout). The native engine proved
// out on a real drive and the old expo-location path is the known-bad one, so
// every build-73 device runs native unless it explicitly opted out. Only matters
// where isNativeEngineAvailable() is also true (build 73+ binary), so build 72/69
// devices stay on the JS path regardless. Setting the flag to '0' (a device
// toggle, or flipping this default back via OTA) is an instant, zero-risk
// rollback - nothing native runs and detection falls back to JS.

import { getDatabase } from "../db/index";

const FLAG_KEY = "native_location_engine";

/** Whether this device runs the native engine. Default ON: a missing flag now
 *  means "on" (fleet rollout); only an explicit '0' opts out. A DB read failure
 *  falls back to the old JS path (safer than assuming native when state is
 *  unknown). */
export async function isNativeLocationEngineEnabled(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [FLAG_KEY]
    );
    if (!row) return true; // no explicit choice → on
    return row.value === "1";
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
