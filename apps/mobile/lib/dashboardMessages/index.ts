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
  | "detection_off"
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
  // Recording switched off in Settings outranks everything: nothing else on
  // the screen matters while no miles are being kept (16 Sep 2026, 26 phones).
  "detection_off",
  "first_trip",
  "saved_places",
  "referral",
  "pro",
  "android_beta",
];

/** Two is enough to be useful and few enough not to be a list of chores. */
export const MAX_SUGGESTIONS = 2;

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
  batteryNudgeShow: boolean;

  // Per-item snoozes (7 days), already persisted in tracking_state.
  bgLocNudgeSilenced: boolean;
  motionNudgeSilenced: boolean;
  notifDeniedNudgeSilenced: boolean;
  notifPrimerSilenced: boolean;

  /** When the permanent Settings switch went off, or null when it is on. A
   *  timed pause is not this: it shows its own row and ends by itself. */
  detectionOffSince: number | null;

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
      applicable: i.batteryApplicable,
      done: i.batteryApplicable ? !i.batteryNudgeShow : true,
      actionable: i.batteryApplicable && i.batteryNudgeShow,
      silenced: false, // dismissal already clears batteryNudgeShow upstream
    },
  ];
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
    detection_off: i.detectionOffSince !== null,
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
