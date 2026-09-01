// Android battery optimisation: whether to nudge, which screen to send the
// user to, and what to tell them before they get there.
//
// The recorder is a foreground service that RNBG keeps alive between drives.
// Two things on Android can end it while the app sits in the background:
// stock Android's battery optimisation (the "Optimised / Unrestricted" setting
// every phone has), and the vendor power managers layered on top by Huawei,
// Honor, Xiaomi, Oppo, Samsung and others (App launch, Autostart, Sleeping
// apps). Once the service is gone, the stationary geofence that would wake the
// engine for the next drive has nothing to wake, and the drive is simply not
// recorded. Not late, not orphaned: never captured.
//
// SteveG, 1 Sep 2026 (Honor X5C, Android 5): a ~10 mile drive at 16:30 left
// no trace in either store. The phone's log is silent from 12:44, when he
// closed the app at Hatfield, to 17:52, when he next opened it. His morning's
// 135 miles were captured fine by an engine that had been running; by the
// afternoon Honor's App launch manager had ended it. The app had never asked
// him about battery settings and never reported them.
//
// RNBG ships the two calls this needs (deviceSettings.showPowerManager for the
// vendor screen, showIgnoreBatteryOptimizations for the stock one) so this is
// JS-only. Pure, like orphanRoute.ts: the test runner cannot import the native
// stack.

/** The vendor screen is the one that matters on the phones that have one; the
 *  stock screen is the fallback everywhere else. */
export type PowerScreen = "vendor" | "stock";

export interface VendorPowerManager {
  /** As RNBG reports it, e.g. "HONOR", "samsung", "Xiaomi". */
  manufacturer: string;
  model: string;
  /** RNBG remembers whether we have already sent the user to this screen.
   *  It cannot tell whether they did anything there, so once seen we stop
   *  asking rather than nag about a setting they may already have changed. */
  seen: boolean;
}

export interface BatteryOptimisationState {
  /** Stock Android: is MileClear on the "ignore battery optimisations" list?
   *  null when the module could not answer. */
  ignoring: boolean | null;
  /** null when the device has no vendor power manager (Pixel, most stock
   *  Android) or RNBG has no screen for it. */
  vendor: VendorPowerManager | null;
}

/** Same weekly cadence as the other permission nudges on the dashboard. */
export const BATTERY_NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export type BatteryNudgeReason =
  | "not_android"
  | "unknown"
  | "snoozed"
  | "vendor_power_manager"
  | "optimised"
  | "exempt";

export interface BatteryNudgeDecision {
  show: boolean;
  reason: BatteryNudgeReason;
  screen: PowerScreen | null;
}

export interface BatteryNudgeInput {
  platform: string;
  state: BatteryOptimisationState | null;
  dismissedAt: number | null;
  now: number;
}

export function batteryNudgeDecision(input: BatteryNudgeInput): BatteryNudgeDecision {
  if (input.platform !== "android") return { show: false, reason: "not_android", screen: null };
  if (!input.state) return { show: false, reason: "unknown", screen: null };
  if (input.dismissedAt !== null && input.now - input.dismissedAt < BATTERY_NUDGE_SNOOZE_MS) {
    return { show: false, reason: "snoozed", screen: null };
  }
  // Vendor first. On a Honor or Huawei the stock allow-list can say "exempt"
  // while App launch management is still ending the service, so the stock
  // answer is not evidence of safety on these phones.
  if (input.state.vendor && !input.state.vendor.seen) {
    return { show: true, reason: "vendor_power_manager", screen: "vendor" };
  }
  if (input.state.ignoring === false) {
    return { show: true, reason: "optimised", screen: "stock" };
  }
  return { show: false, reason: "exempt", screen: null };
}

/** "HONOR" → "Honor", "samsung" → "Samsung". Unknown/empty → "Your phone". */
export function brandName(manufacturer: string | null | undefined): string {
  const m = (manufacturer ?? "").trim();
  if (!m) return "Your phone";
  return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
}

/** Huawei and Honor share the same App launch screen (Honor was Huawei's
 *  brand until 2020 and kept the settings app). Their screen has a specific
 *  three-toggle layout worth spelling out; other vendors get generic copy. */
export function isHuaweiFamily(manufacturer: string | null | undefined): boolean {
  const m = (manufacturer ?? "").toLowerCase();
  return m.includes("huawei") || m.includes("honor");
}

export interface BatteryNudgeCopy {
  title: string;
  body: string;
}

/** What the card says BEFORE the tap. The tap leaves the app for a settings
 *  screen we cannot annotate, so the instruction has to be read first. */
export function batteryNudgeCopy(
  screen: PowerScreen,
  manufacturer: string | null | undefined
): BatteryNudgeCopy {
  const title = "Your phone can stop recording";
  if (screen === "vendor") {
    const brand = brandName(manufacturer);
    if (isHuaweiFamily(manufacturer)) {
      return {
        title,
        body: `${brand}'s power manager closes apps in the background, so drives go unrecorded. Tap to open it, turn off Manage automatically, and allow all three options for MileClear.`,
      };
    }
    return {
      title,
      body: `${brand}'s power manager can close MileClear between drives, so journeys go unrecorded. Tap to open it and allow MileClear to run in the background.`,
    };
  }
  return {
    title,
    body: "Android's battery optimisation can close MileClear between drives, so journeys go unrecorded. Tap to open the setting, find MileClear and set it to Unrestricted (Don't optimise on older phones).",
  };
}
