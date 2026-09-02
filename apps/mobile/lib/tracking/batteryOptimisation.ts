// Android battery optimisation: read the state, open the right settings
// screen. The rule for whether to nudge and what to say lives in
// batteryOptimisationRule.ts (pure); this file is the native side of it.
//
// Nothing here runs off Android. Everything is wrapped so an RNBG build
// without the DeviceSettings API, or Expo Go, answers null and the nudge
// stays hidden rather than crashing a dashboard render.
import { Platform } from "react-native";
import { getNativeDeviceSettings } from "./nativeLocation";
import { logDetectionEvent } from "./detection";
import type { BatteryOptimisationState, PowerScreen } from "./batteryOptimisationRule";

let checkedThisLaunch = false;

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

  const state: BatteryOptimisationState = { ignoring, vendor, manufacturer };
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
