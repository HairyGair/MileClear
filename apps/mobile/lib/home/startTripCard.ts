// Home's "Trip in progress" card for a running Start Trip (28 Oct 2026).
//
// John, 27 Oct: Start Trip at 05:54, a fuel price notification at 08:06 took
// him to the Fuel screen, and back on Home the trip was only the small
// "Recording" status line. He spent a while finding how to finish the
// 127-mile drive. Dave (DAVEL), the same day: he opened the trip screen three
// times ten minutes into his drive home, and nothing has saved since. So while
// a Start Trip runs, Home shows it as a card with I've Arrived on it, until the
// trip is finished.
//
// Pure, so the rules are proven without booting the native stack.

import { distanceIn, distanceUnitLabel, type DistanceUnit } from "@mileclear/shared";
import { durationText } from "./statusLine";

/**
 * Mirrors the Start Trip screen's resume guard (app/trip-form.tsx): a start
 * row older than this is cleared as stale when the screen opens, deleting the
 * trip's start row and its route.
 */
export const START_TRIP_RESUME_MAX_MS = 12 * 60 * 60 * 1000;

/**
 * The card stops this far short of that guard, and a tap is checked again
 * against it with the time of the tap, so the card can never lead into it.
 */
export const START_TRIP_CARD_MAX_MS = START_TRIP_RESUME_MAX_MS - 10 * 60 * 1000;

/** A tap on the card may open the trip: started, and well inside the resume guard. */
export function startTripCardTapAllowed(startedAtMs: number | null, nowMs: number): boolean {
  if (startedAtMs == null || !Number.isFinite(startedAtMs)) return false;
  const age = nowMs - startedAtMs;
  return age >= 0 && age < START_TRIP_CARD_MAX_MS;
}

export interface StartTripCardInputs {
  /**
   * active_shift_id is the Start Trip's own lock. Anything else hides the
   * card: no lock (a self-heal stopped the GPS on purpose, and resuming from
   * here would end at the wrong place and could clear a later automatic
   * drive), a shift, or an Arrived waiting to be saved.
   */
  quickLockHeld: boolean;
  /** quick_trip_start's startedAt, or null when the row is missing or unreadable. */
  startedAtMs: number | null;
  /** GPS distance so far. */
  miles: number;
  now: number;
  unit?: DistanceUnit;
}

export interface StartTripCardModel {
  title: string;
  /** "12.4 mi · 24 min". */
  detail: string;
  a11yLabel: string;
}

/**
 * The card, or null when there is no Start Trip recording that the screen
 * would resume: no Start Trip lock, no readable start row (the screen would
 * open a fresh Start Trip), or a start row near or past the screen's resume
 * guard.
 */
export function startTripCardModel(i: StartTripCardInputs): StartTripCardModel | null {
  if (!i.quickLockHeld) return null;
  if (!startTripCardTapAllowed(i.startedAtMs, i.now)) return null;
  const age = i.now - (i.startedAtMs as number);
  const unit = i.unit ?? "miles";
  const d = Math.max(0, distanceIn(i.miles, unit));
  const distance = `${d < 100 ? d.toFixed(1) : String(Math.round(d))} ${distanceUnitLabel(unit)}`;
  const duration = durationText(age);
  return {
    title: "Trip in progress",
    detail: `${distance} · ${duration}`,
    a11yLabel: `Trip in progress, ${distance}, ${duration}`,
  };
}

/** How long a tap on the card's I've Arrived waits for the Start Trip screen to take it. */
export const ARRIVE_REQUEST_TTL_MS = 30 * 1000;

/** The request is still fresh enough for the Start Trip screen to act on. */
export function arriveRequestLive(requestedAtMs: number | null, nowMs: number): boolean {
  if (requestedAtMs == null || !Number.isFinite(requestedAtMs)) return false;
  const age = nowMs - requestedAtMs;
  return age >= 0 && age <= ARRIVE_REQUEST_TTL_MS;
}

/** The parts of the root stack's navigation state the check below reads. */
export interface StackStateLike {
  index: number;
  routes: { key: string; name: string }[];
}

export type OpenStartTripPlan =
  | { kind: "here" } // the recording screen is already on top
  | { kind: "pop"; count: number; key: string } // pop exactly this many screens to reach it
  | { kind: "open" }; // none in the stack: open a fresh one, which resumes the trip

/**
 * Where a tap on the running trip goes. A notification tap from the Start Trip
 * screen opens its screen on top and leaves the trip's screen mounted below,
 * still holding its route; opening another copy would give two screens that
 * can each save the drive. So go back to that very screen, found by its route
 * key in the live stack, never by name: the nearest "trip-form" can be a
 * different one (a trip being viewed or typed in) and would then resume the
 * same trip as a second copy. A registered key no longer in the stack (a
 * screen still closing, its view not yet gone) counts as no screen.
 */
export function openStartTripPlan(state: StackStateLike | null | undefined, recordingKeys: string[]): OpenStartTripPlan {
  if (!state || !Array.isArray(state.routes) || state.routes.length === 0) return { kind: "open" };
  const top = Math.min(Math.max(0, state.index), state.routes.length - 1);
  const keys = new Set(recordingKeys);
  for (let i = top; i >= 0; i--) {
    if (keys.has(state.routes[i].key)) {
      return i === top ? { kind: "here" } : { kind: "pop", count: top - i, key: state.routes[i].key };
    }
  }
  return { kind: "open" };
}

/**
 * A Start Trip screen opening finds a running trip to resume. If another
 * screen in the stack is already recording it, a second copy must not resume
 * it too (both could save the drive): a past-trip form stays a past-trip form,
 * and anything else gives way to the recording screen by popping back to it.
 * Many places open the screen (Trips, the last-trip card, notifications), so
 * the check lives here rather than in each of them.
 */
export function resumeSecondCopyPlan(
  state: StackStateLike | null | undefined,
  recordingKeys: string[],
  ownKey: string,
  openedForPastTrip: boolean
): { kind: "resume" } | { kind: "stay_manual" } | { kind: "pop"; count: number; key: string } {
  const others = recordingKeys.filter((k) => k !== ownKey);
  if (others.length === 0) return { kind: "resume" };
  const plan = openStartTripPlan(state, others);
  if (plan.kind !== "pop") return { kind: "resume" };
  return openedForPastTrip ? { kind: "stay_manual" } : plan;
}

/**
 * Start Trip tapped on a screen in Ready while a Start Trip is already
 * recording (its lock and start row both there): starting would wipe that
 * trip's route and start row. Send the driver to it instead.
 */
export function startTripWouldReplaceRunning(lockValue: string | null | undefined, hasStartRow: boolean): boolean {
  return lockValue === "__quick_trip__" && hasStartRow;
}

/**
 * A second copy giving way pops itself first, then this many more screens
 * towards the recording one (see resumeSecondCopyPlan's caller).
 */
export function popsAfterSelf(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count) - 1) : 0;
}

/** After a pop: it went through when the screen it aimed at is now on top. */
export function popLanded(state: StackStateLike | null | undefined, key: string): boolean {
  if (!state || !Array.isArray(state.routes) || state.routes.length === 0) return false;
  const top = Math.min(Math.max(0, state.index), state.routes.length - 1);
  return state.routes[top].key === key;
}

/** Two taps this close together are one: the second must not open a second screen. */
export const OPEN_START_TRIP_DEBOUNCE_MS = 1500;

export function openStartTripDue(lastOpenMs: number | null, nowMs: number): boolean {
  return lastOpenMs == null || nowMs - lastOpenMs < 0 || nowMs - lastOpenMs >= OPEN_START_TRIP_DEBOUNCE_MS;
}
