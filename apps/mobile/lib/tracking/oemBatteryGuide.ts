// Per-maker battery guide for the Android phones that kill background apps
// hardest. Silent driving days (days the driver drove but nothing recorded),
// 30 days to 1 Nov 2026: Samsung/Google/Xiaomi ~7%, Motorola 32%, OnePlus 33%,
// HONOR 36%, OPPO 58%, realme 67% (2-8 drivers each, so small samples).
// General battery advice showed no measurable effect, so this is specific:
// the real setting labels on each maker's skin, in order, with a button that
// opens the nearest settings screen.
//
// Pure (no native imports) so vitest can run it. The screen is
// app/oem-battery-guide.tsx; the native side is batteryOptimisation.ts.
//
// Setting names follow dontkillmyapp.com and each maker's current skin
// (ColorOS / realme UI / OxygenOS, Hello UI, MagicOS, Funtouch/OriginOS).
// Menu names drift between versions, so each step names the setting the
// driver is looking for rather than a long path.

export type OemGroup = "oppo_realme" | "oneplus" | "motorola" | "honor_huawei" | "vivo";

export interface OemGuide {
  group: OemGroup;
  /** Plain brand name for the title, e.g. "OPPO". */
  brand: string;
  title: string;
  intro: string;
  steps: string[];
  closing: string;
}

/** Which guide, if any, a phone maker gets. Samsung, Google, Xiaomi and
 *  unknown makers return null and keep today's flow. */
export function oemGroupFor(manufacturer: string | null | undefined): OemGroup | null {
  const m = (manufacturer ?? "").toLowerCase().trim();
  if (!m) return null;
  if (m.includes("oppo") || m.includes("realme")) return "oppo_realme";
  if (m.includes("oneplus")) return "oneplus";
  if (m.includes("motorola") || m === "moto") return "motorola";
  if (m.includes("honor") || m.includes("huawei")) return "honor_huawei";
  if (m.includes("vivo") || m.includes("iqoo")) return "vivo";
  return null;
}

/** Which settings screen the button opens first. "vendor" is the maker's
 *  start-up list (RNBG showPowerManager, falling back to the stock list, then
 *  the app's own page). "app" is the app info page (Linking.openSettings).
 *  ColorOS / OxygenOS: RNBG's vendor screen is the old start-up list, often
 *  blocked on newer versions, and Allow background activity / Allow auto
 *  launch live on App info > Battery usage. Motorola has no vendor screen.
 *  Opening more exact screens needs native code, so it is not done here. */
export function oemFirstScreen(group: OemGroup): "vendor" | "app" {
  return group === "honor_huawei" || group === "vivo" ? "vendor" : "app";
}

/** "realme" and "OnePlus" keep their own casing; unknown is "Your phone". */
export function oemBrandName(manufacturer: string | null | undefined): string {
  const m = (manufacturer ?? "").toLowerCase();
  if (m.includes("realme")) return "realme";
  if (m.includes("oneplus")) return "OnePlus";
  if (m.includes("oppo")) return "OPPO";
  if (m.includes("motorola")) return "Motorola";
  if (m.includes("honor")) return "HONOR";
  if (m.includes("huawei")) return "Huawei";
  if (m.includes("iqoo")) return "iQOO";
  if (m.includes("vivo")) return "vivo";
  return "Your phone";
}

const LOCK =
  "Open your recent apps, then lock MileClear (tap its icon or the three dots at the top of its card, then Lock) so swiping apps away never closes it.";

export function oemGuideFor(manufacturer: string | null | undefined): OemGuide | null {
  const group = oemGroupFor(manufacturer);
  if (!group) return null;
  const brand = oemBrandName(manufacturer);
  const title = `Keep MileClear running on your ${brand}`;
  const done = "Tap Done when you've been through them.";
  switch (group) {
    case "oppo_realme":
    case "oneplus":
      return {
        group, brand, title,
        intro: `${brand} closes apps in the background unless you allow them, and drives go unrecorded. Four quick settings fix it.`,
        steps: [
          "Tap Open settings below. You land on MileClear's App info page.",
          "Open Battery usage and turn on Allow background activity. If you see Unrestricted, choose it.",
          "Turn on Allow auto launch (on App info, or in Settings > Apps > Auto launch).",
          LOCK,
        ],
        closing: done,
      };
    case "motorola":
      return {
        group, brand, title,
        intro: "Motorola's battery saving can close MileClear between drives, and drives go unrecorded. Two settings fix it.",
        steps: [
          "Tap Open settings below. You land on MileClear's App info page. Open Battery (App battery usage) and turn on Allow background usage, or choose Unrestricted.",
          "Go to Settings > Battery and turn Adaptive battery off (on some phones it sits under Adaptive preferences).",
        ],
        closing: "Tap Done when you've set both.",
      };
    case "honor_huawei":
      return {
        group, brand, title,
        intro: `${brand} closes apps in the background unless you manage them yourself, and drives go unrecorded. Four quick settings fix it.`,
        steps: [
          "Tap Open settings below. In the App launch list (Settings > Battery > App launch), find MileClear.",
          "Turn off Manage automatically.",
          "Turn on Auto-launch, Secondary launch and Run in background.",
          "Then open Settings > Apps > Special access > Battery optimisation, show All apps, find MileClear and choose Don't allow. " + LOCK,
        ],
        closing: done,
      };
    case "vivo":
      return {
        group, brand, title,
        intro: `${brand} closes apps in the background unless you allow them, and drives go unrecorded. Four quick settings fix it.`,
        steps: [
          "Tap Open settings below. In the background start-up list, find MileClear and turn it on.",
          "Go to Battery > Background power consumption management, choose MileClear and pick Allow high background power consumption.",
          "Turn on Autostart for MileClear (Settings > Apps > Autostart, or i Manager > App manager > Autostart manager).",
          LOCK,
        ],
        closing: done,
      };
  }
}

// ── Verification ────────────────────────────────────────────────────────

export interface VerificationMessage {
  /** "yes": the stock setting is confirmed. "no": still Optimised.
   *  "unknown": the phone would not say. */
  result: "yes" | "no" | "unknown";
  headline: string;
  detail: string;
}

const OPPO_ONEPLUS_LIMITED =
  "Open settings again, go to Battery usage and choose Unrestricted (or Allow background activity).";
const OPPO_ONEPLUS_UNSEEN =
  "The auto launch and lock switches can't be checked from the app, so make sure you turned those on too.";

const STILL_LIMITED: Record<OemGroup, string> = {
  oppo_realme: OPPO_ONEPLUS_LIMITED,
  oneplus: OPPO_ONEPLUS_LIMITED,
  motorola: "Open settings again, go to Battery and turn on Allow background usage, or choose Unrestricted.",
  honor_huawei:
    "Open Settings > Apps > Special access > Battery optimisation, show All apps, find MileClear and choose Don't allow.",
  vivo: "Open Battery > Background power consumption management, choose MileClear and pick Allow high background power consumption.",
};

const STILL_TO_CHECK: Record<OemGroup, string> = {
  oppo_realme: OPPO_ONEPLUS_UNSEEN,
  oneplus: OPPO_ONEPLUS_UNSEEN,
  motorola: "Adaptive battery can't be checked from the app, so make sure that is off too.",
  honor_huawei:
    "App launch (Auto-launch, Secondary launch, Run in background) can't be checked from the app, so make sure those are on too.",
  vivo: "Autostart and the lock can't be checked from the app, so make sure those are on too.",
};

/**
 * What to tell the driver when they come back from settings. `ignoring` is
 * isIgnoringBatteryOptimizations(): it confirms only the stock Unrestricted
 * setting. The maker's own switches are invisible to the app, so each "yes"
 * names the ones it could not see.
 */
export function verificationMessage(
  ignoring: boolean | null,
  group: OemGroup = "oppo_realme"
): VerificationMessage {
  if (ignoring === true) {
    return {
      result: "yes",
      headline: "Battery use is now Unrestricted",
      detail: "That part worked. " + STILL_TO_CHECK[group],
    };
  }
  if (ignoring === false) {
    return {
      result: "no",
      headline: "MileClear is still limited",
      detail: "Your phone still lists MileClear as Optimised. " + STILL_LIMITED[group],
    };
  }
  return {
    result: "unknown",
    headline: "We can't check this phone",
    detail: "If you went through the steps, you're done. Your next drives will show whether it worked.",
  };
}

// ── Decisions shared by Home, Settings and the screen ───────────────────

/** What tapping the battery row does. OEM makers go to the guide, passing the
 *  maker along so the screen never re-derives it. */
export type BatteryRowTap = { kind: "oem_guide"; maker: string } | { kind: "default" };

export function batteryRowTap(manufacturer: string | null | undefined): BatteryRowTap {
  const maker = (manufacturer ?? "").trim();
  return maker && oemGroupFor(maker) ? { kind: "oem_guide", maker } : { kind: "default" };
}

// ── Events and stored state ─────────────────────────────────────────────

export const OEM_GUIDE_EVENTS = {
  shown: "oem_battery_guide.shown",
  openedSettings: "oem_battery_guide.opened_settings",
  done: "oem_battery_guide.done",
  verified: "oem_battery_guide.verified",
} as const;

/** tracking_state key: epoch ms of the last Done tap. */
export const OEM_GUIDE_DONE_KEY = "oem_battery_guide_done_at";

/** tracking_state key the Home battery row reads for its 7-day snooze. */
export const BATTERY_SNOOZE_KEY = "battery_opt_nudge_dismissed_at";

/** What Done writes: the Done time, and the snooze so Home hides the row. */
export function doneStateWrites(now: number): Array<[string, string]> {
  return [
    [OEM_GUIDE_DONE_KEY, String(now)],
    [BATTERY_SNOOZE_KEY, String(now)],
  ];
}
