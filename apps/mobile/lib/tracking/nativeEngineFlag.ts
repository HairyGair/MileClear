// Feature flag for the native location engine (see nativeLocation.ts).
//
// Default ON as of 4 Jun 2026 (build 73 fleet rollout). The native engine proved
// out on a real drive and the old expo-location path is the known-bad one, so
// every build-73 device runs native unless it explicitly opted out. Only matters
// where isNativeEngineAvailable() is also true (build 73+ binary), so build 72/69
// devices stay on the JS path regardless. Setting the flag to '0' (a device
// toggle, or flipping this default back via OTA) is an instant, zero-risk
// rollback on iOS - nothing native runs and detection falls back to JS.
//
// It is NOT a rollback on Android (21 Sep 2026). There the JS path records
// nothing, so '0' is an off switch, not a fallback; see jsEngineRule.ts. The
// paths that could set it - the self-heal, the set_native_engine silent push
// and the diagnostics toggle - all refuse on Android now, and an unreadable
// flag resolves to native there rather than to JS.

import { Platform } from "react-native";

import { getDatabase } from "../db/index";
import { canPlatformRunJsEngine } from "./jsEngineRule";

const FLAG_KEY = "native_location_engine";

/** Whether this device runs the native engine. Default ON: a missing flag now
 *  means "on" (fleet rollout); only an explicit '0' opts out. A DB read failure
 *  falls back to the old JS path on iOS, where that path captures, and to
 *  native on Android, where it does not. */
export async function isNativeLocationEngineEnabled(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [FLAG_KEY]
    );
    if (!row) return true; // no explicit choice → on
    if (row.value === "1") return true;
    // An explicit '0' is honoured on iOS, where it means "use the other
    // engine". On Android it means "record nothing", and every path that
    // could write it now refuses there, so any Android phone still holding
    // one is carrying a decision made before those guards existed: a server
    // push or a toggle on an older build. Two phones fleet-wide were on the
    // JS engine on 21 Sep 2026, and on Android that is not a rollback, it is
    // a phone that has silently stopped working. Coerce it back.
    return !canPlatformRunJsEngine(Platform.OS);
  } catch {
    // State unknown. On iOS the JS engine is a working engine, so the old
    // conservative answer stands. On Android it captures nothing, so a single
    // SQLite read error here would hand the phone to an engine that never
    // records and leave the dashboard claiming tracking is on: fail closed to
    // native instead (Android loses a median 44% of days to silence against
    // 10% on iOS, measured 21 Sep 2026).
    return !canPlatformRunJsEngine(Platform.OS);
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
