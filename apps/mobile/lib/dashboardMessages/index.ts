// What the dashboard is allowed to say to you, and in what order.
//
// Before this module there were sixteen conditional cards hardcoded above the
// dashboard sections, each hand-wired to avoid the others: the Background App
// Refresh card required `locationTier !== "none"`, the regression card
// required `locationTier !== "always"`, the motion card required
// `locationTier === "always" && !bgRefreshOff`, and so on. That worked inside
// the permission family, but nothing excluded the notification cards or the
// growth cards, so a driver could open the app to five simultaneous asks
// stacked above their own mileage (Anthony, 14 Sep 2026, screenshot).
//
// Adding a seventeenth card meant editing sixteen other conditions correctly.
// This replaces that with one ordered list and a hard cap.
//
// The rules:
//   1. At most ONE thing above your mileage. A blocker OR the setup card,
//      never both - a checklist underneath "your trips aren't recording" is
//      noise, and the blocker is the only thing worth doing first.
//   2. The five amber permission nags collapse into one setup card with a
//      progress count, so they have a finish line instead of reappearing
//      one at a time forever.
//   3. Suggestions live BELOW your mileage, capped at two.
//
// Pure and unit-tested, like gapStop / quickTripLock / missedJourneyTimes,
// so the ordering can be proven without booting the native stack.

export type LocationTier = "none" | "foreground" | "always";
export type NotifPermission = "granted" | "denied" | "undetermined";

/** Red, non-dismissible: MileClear cannot record a single mile in this state. */
export type BlockerId = "no_location" | "bg_refresh_off" | "permission_lost";

/** Amber, snoozeable: recording works, but not as well as it should. */
export type SetupId = "always_location" | "motion" | "notifications" | "battery";

/** Optional. Never above the fold. */
export type SuggestionId =
  | "first_trip"
  | "saved_places"
  | "referral"
  | "pro"
  | "android_beta";

/** Highest first. A blocker outranks everything else on the screen. */
export const BLOCKER_ORDER: BlockerId[] = [
  "no_location",
  "bg_refresh_off",
  "permission_lost",
];

/** Order the checklist rows are listed in. Location first: it is the one
 *  that actually costs miles. */
export const SETUP_ORDER: SetupId[] = [
  "always_location",
  "motion",
  "notifications",
  "battery",
];

/** first_trip outranks everything: a driver with zero trips has one job. */
export const SUGGESTION_ORDER: SuggestionId[] = [
  "first_trip",
  "saved_places",
  "referral",
  "pro",
  "android_beta",
];

/** Two is enough to be useful and few enough not to be a list of chores. */
export const MAX_SUGGESTIONS = 2;

/** Battery snooze. 7 days, the same cadence as every other nudge here.
 *  15 Sep 2026 Android audit: optimisation was still ON for 12 of the 17
 *  phones reporting it, and a Samsung or Honor with it on ends the recorder
 *  between drives. A dismissal can only ever be a snooze. */
export const BATTERY_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export interface MessageInputs {
  /** The dashboard renders a separate screen during a shift; belt and braces. */
  activeShift: boolean;
  loading: boolean;

  locationTier: LocationTier;
  bgRefreshOff: boolean;
  bgPermissionLost: boolean;
  motionDenied: boolean;
  notifPermission: NotifPermission;

  /** Android only. `batteryApplicable` distinguishes "not on this platform"
   *  from "already sorted" - without it, iOS would show 3 of 4 done forever. */
  batteryApplicable: boolean;
  /** The phone's own answer to isIgnoringBatteryOptimizations(): the same
   *  value the diagnostic dump reports as `batteryOptimisation.ignoring`.
   *  The row is done when, and only when, this reads true. null = the
   *  module could not answer (Expo Go, a build without it), and the row is
   *  left out rather than shown as done or as a chore nobody can finish. */
  batteryIgnoring: boolean | null;
  /** When the driver last tapped "later" on the battery row. Snoozes the row
   *  for BATTERY_SNOOZE_MS, then it comes back; nothing makes it go away for
   *  good except the setting itself. Same tracking_state pattern as the
   *  other flags (`battery_opt_nudge_dismissed_at`). */
  batteryDismissedAt: number | null;
  now: number;

  // Per-item snoozes (7 days), already persisted in tracking_state.
  bgLocNudgeSilenced: boolean;
  motionNudgeSilenced: boolean;
  notifDeniedNudgeSilenced: boolean;
  notifPrimerSilenced: boolean;

  // Suggestion eligibility, computed by the caller from its own state.
  firstTripEligible: boolean;
  savedPlacesEligible: boolean;
  referralEligible: boolean;
  proEligible: boolean;
  androidBetaEligible: boolean;
}

export interface SetupItem {
  id: SetupId;
  /** False when the platform has no such setting at all. */
  applicable: boolean;
  done: boolean;
  /** Can the user act on it right now, or is it waiting on an earlier step? */
  actionable: boolean;
  /** Snoozed by the user; still counted in progress, just not nagged about. */
  silenced: boolean;
}

export interface SetupSummary {
  items: SetupItem[];
  done: number;
  total: number;
}

export interface DashboardMessages {
  /** At most one, pinned above your mileage. */
  blocker: BlockerId | null;
  /** Null when a blocker is showing, or when there is nothing left to do. */
  setup: SetupSummary | null;
  /** Below your mileage, capped at MAX_SUGGESTIONS. */
  suggestions: SuggestionId[];
}

function pickBlocker(i: MessageInputs): BlockerId | null {
  for (const id of BLOCKER_ORDER) {
    if (id === "no_location" && i.locationTier === "none") return id;
    // Ordering makes the old `locationTier !== "none"` guard redundant: if the
    // tier were "none" we would have returned above.
    if (id === "bg_refresh_off" && i.bgRefreshOff) return id;
    // NOT implied by ordering - a user can have Always granted and still carry
    // a stale permission_lost flag, and we must not nag them.
    if (id === "permission_lost" && i.bgPermissionLost && i.locationTier !== "always") {
      return id;
    }
  }
  return null;
}

function buildSetup(i: MessageInputs): SetupItem[] {
  const alwaysDone = i.locationTier === "always";
  // Applicable only where the phone could actually answer. Done only when
  // the answer is the one the dump would report as ignoring:true.
  const batteryApplicable = i.batteryApplicable && i.batteryIgnoring !== null;
  const batteryDone = batteryApplicable && i.batteryIgnoring === true;
  return [
    {
      id: "always_location",
      applicable: true,
      done: alwaysDone,
      actionable: i.locationTier === "foreground",
      silenced: i.bgLocNudgeSilenced,
    },
    {
      id: "motion",
      applicable: true,
      done: !i.motionDenied,
      // Chasing motion before location is sorted is asking for the wrong
      // thing first; the old gate required locationTier === "always" too.
      actionable: i.motionDenied && alwaysDone,
      silenced: i.motionNudgeSilenced,
    },
    {
      id: "notifications",
      applicable: true,
      done: i.notifPermission === "granted",
      actionable: i.notifPermission !== "granted",
      silenced:
        i.notifPermission === "denied"
          ? i.notifDeniedNudgeSilenced
          : i.notifPrimerSilenced,
    },
    {
      id: "battery",
      applicable: batteryApplicable,
      done: batteryDone,
      actionable: batteryApplicable && !batteryDone,
      silenced:
        i.batteryDismissedAt !== null &&
        i.now - i.batteryDismissedAt < BATTERY_SNOOZE_MS,
    },
  ];
}

export interface BatteryChecklistCopy {
  label: string;
  /** The exact path through this maker's Settings app, since the tap can
   *  only open the stock screen and on Samsung, Honor and Xiaomi the setting
   *  that actually matters is a different one. */
  hint: string;
}

/**
 * What the battery row says, by phone maker. The manufacturer string is
 * whatever the phone reports ("samsung", "HONOR", "Xiaomi"); matching is
 * case-insensitive and by substring so "HUAWEI" and "Huawei" both land.
 * Unknown or empty falls back to the stock Android path, which exists on
 * every phone even where a vendor screen sits on top of it.
 */
export function batteryChecklistCopy(
  manufacturer: string | null | undefined
): BatteryChecklistCopy {
  const m = (manufacturer ?? "").toLowerCase();
  if (m.includes("samsung")) {
    return {
      label: "Stop Samsung putting MileClear to sleep",
      hint: "Settings, Battery, Background usage limits, Never sleeping apps: add MileClear",
    };
  }
  if (m.includes("honor") || m.includes("huawei")) {
    return {
      label: "Let MileClear run in the background",
      hint: "Settings, Battery, App launch: MileClear, Manage manually, all three on",
    };
  }
  if (m.includes("xiaomi") || m.includes("redmi") || m.includes("poco")) {
    return {
      label: "Let MileClear run in the background",
      hint: "Settings, Battery, App battery saver: MileClear, No restrictions",
    };
  }
  return {
    label: "Set MileClear's battery use to Unrestricted",
    hint: "Settings, Apps, MileClear, Battery, Unrestricted",
  };
}

export function selectDashboardMessages(i: MessageInputs): DashboardMessages {
  const empty: DashboardMessages = { blocker: null, setup: null, suggestions: [] };
  if (i.activeShift) return empty;

  const blocker = pickBlocker(i);

  // Rule 1: a blocker owns the space above your mileage, alone.
  let setup: SetupSummary | null = null;
  if (!blocker && !i.loading) {
    const items = buildSetup(i);
    const applicable = items.filter((it) => it.applicable);
    const outstanding = applicable.filter((it) => !it.done);
    const worthShowing = outstanding.some((it) => it.actionable && !it.silenced);
    if (outstanding.length > 0 && worthShowing) {
      setup = {
        items,
        done: applicable.filter((it) => it.done).length,
        total: applicable.length,
      };
    }
  }

  const eligible: Record<SuggestionId, boolean> = {
    first_trip: i.firstTripEligible,
    saved_places: i.savedPlacesEligible,
    referral: i.referralEligible,
    pro: i.proEligible,
    android_beta: i.androidBetaEligible,
  };
  const suggestions = SUGGESTION_ORDER.filter((id) => eligible[id]).slice(
    0,
    MAX_SUGGESTIONS
  );

  return { blocker, setup, suggestions };
}
