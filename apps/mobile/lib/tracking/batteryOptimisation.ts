// Android battery optimisation: read the state, open the right settings
// screen. The rule for whether to nudge and what to say lives in
// batteryOptimisationRule.ts (pure); this file is the native side of it.
//
// Nothing here runs off Android. Everything is wrapped so an RNBG build
// without the DeviceSettings API, or Expo Go, answers null and the nudge
// stays hidden rather than crashing a dashboard render.
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { getNativeDeviceSettings } from "./nativeLocation";
import { logDetectionEvent } from "./detection";
import { getDatabase } from "../db/index";
import { apiRequest } from "../api/index";
import type { BatteryOptimisationState, PowerScreen } from "./batteryOptimisationRule";

let checkedThisLaunch = false;

/** tracking_state key: the last `ignoring` answer we saw ("0" / "1"). Kept
 *  across launches so a driver who fixes the setting and comes back the next
 *  day still produces one `battery_opt_nudge.resolved`, not silence. */
const LAST_IGNORING_KEY = "battery_opt_last_ignoring";
let lastIgnoringThisLaunch: boolean | null | undefined;

/**
 * The phone maker, for the checklist copy. RNBG's request objects carry it,
 * but only when one of the two settings calls succeeds; on the phones where
 * neither does we would say "Your phone" to a Samsung. So: RNBG first, then
 * React Native's own constants (always present on Android), then expo-device
 * read by name the way clientContext does, so an OTA never references the
 * package and a binary without the native module gets null, not a crash.
 */
export function getDeviceManufacturer(fromNative?: string | null): string | null {
  const trimmed = (fromNative ?? "").trim();
  if (trimmed) return trimmed;
  if (Platform.OS !== "android") return null;
  try {
    const constants = Platform.constants as { Manufacturer?: string } | undefined;
    if (constants?.Manufacturer?.trim()) return constants.Manufacturer.trim();
  } catch {
    // fall through
  }
  try {
    const ExpoDevice = requireOptionalNativeModule<{ manufacturer?: string }>("ExpoDevice");
    if (ExpoDevice?.manufacturer?.trim()) return ExpoDevice.manufacturer.trim();
  } catch {
    // fall through
  }
  return null;
}

/**
 * The fleet measurement for the battery row: one `battery_opt_nudge.resolved`
 * the first time a phone that read ignoring:false reads ignoring:true. Same
 * channel as `.shown` / `.snoozed` (app_events, admin-visible), so the three
 * can be counted against each other. Compared against both this launch's
 * last answer and the persisted one, and never fires twice for one flip.
 */
async function noteIgnoringForResolvedEvent(
  ignoring: boolean | null,
  manufacturer: string | null
): Promise<void> {
  if (ignoring === null) return;
  let previous: boolean | null = lastIgnoringThisLaunch ?? null;
  let db: Awaited<ReturnType<typeof getDatabase>> | null = null;
  try {
    db = await getDatabase();
    if (lastIgnoringThisLaunch === undefined) {
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = ?",
        [LAST_IGNORING_KEY]
      );
      previous = row?.value === "1" ? true : row?.value === "0" ? false : null;
    }
  } catch {
    db = null;
  }
  lastIgnoringThisLaunch = ignoring;
  if (previous === false && ignoring === true) {
    apiRequest("/user/event", {
      method: "POST",
      body: JSON.stringify({
        type: "battery_opt_nudge.resolved",
        metadata: { manufacturer },
      }),
    }).catch(() => {});
    logDetectionEvent("battery_opt_resolved", { manufacturer }).catch(() => {});
  }
  if (db && previous !== ignoring) {
    try {
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
        [LAST_IGNORING_KEY, ignoring ? "1" : "0"]
      );
    } catch {
      // A missed write only costs one duplicate resolved event later.
    }
  }
}

/**
 * Current state, or null when it cannot be known. Logs `battery_opt_checked`
 * once per launch so the answer rides along in the next diagnostic dump even
 * if the dashboard never renders (the dump is where fleet-wide exposure gets
 * read: 4 Android testers granted every permission we ask for and one still
 * lost an afternoon's driving to a setting we never mentioned).
 *
 * showPowerManager() only RETURNS the request describing the vendor screen;
 * nothing is shown until deviceSettings.show(request). On a device with no
 * vendor screen (Pixel, most stock Android) it rejects, which is the "vendor:
 * null" answer, not an error.
 */
export async function getBatteryOptimisationState(): Promise<BatteryOptimisationState | null> {
  if (Platform.OS !== "android") return null;
  const ds = getNativeDeviceSettings();
  if (!ds) return null;

  let ignoring: boolean | null = null;
  try {
    ignoring = await ds.isIgnoringBatteryOptimizations();
  } catch {
    ignoring = null;
  }

  let vendor: BatteryOptimisationState["vendor"] = null;
  try {
    const req = await ds.showPowerManager();
    vendor = { manufacturer: req.manufacturer, model: req.model, seen: !!req.seen };
  } catch {
    vendor = null;
  }

  // The maker, even when there is no vendor screen: the stock request
  // carries it too (it only RETURNS the request; nothing opens here).
  let manufacturer: string | null = vendor?.manufacturer ?? null;
  if (!manufacturer) {
    try {
      const req = await ds.showIgnoreBatteryOptimizations();
      manufacturer = req.manufacturer ?? null;
    } catch {
      manufacturer = null;
    }
  }

  manufacturer = getDeviceManufacturer(manufacturer);

  const state: BatteryOptimisationState = { ignoring, vendor, manufacturer };
  noteIgnoringForResolvedEvent(ignoring, manufacturer).catch(() => {});
  if (!checkedThisLaunch) {
    checkedThisLaunch = true;
    logDetectionEvent("battery_opt_checked", {
      ignoring,
      manufacturer,
      vendorManufacturer: vendor?.manufacturer ?? null,
      vendorModel: vendor?.model ?? null,
      vendorSeen: vendor?.seen ?? null,
    }).catch(() => {});
  }
  return state;
}

/**
 * Open the settings screen the nudge described. Returns false when the
 * device has no such screen, so the caller can fall back to the other one
 * or to Linking.openSettings().
 */
export async function openBatteryOptimisationSettings(screen: PowerScreen): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const ds = getNativeDeviceSettings();
  if (!ds) return false;
  try {
    const req =
      screen === "vendor" ? await ds.showPowerManager() : await ds.showIgnoreBatteryOptimizations();
    await ds.show(req);
    logDetectionEvent("battery_opt_settings_opened", {
      screen,
      manufacturer: req.manufacturer,
      seenBefore: !!req.seen,
    }).catch(() => {});
    return true;
  } catch (err) {
    logDetectionEvent("battery_opt_settings_unavailable", {
      screen,
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
    return false;
  }
}
