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
 * row older than this is cleared as stale when the screen opens, so the card
 * must not send the driver there to "finish" it.
 */
export const START_TRIP_RESUME_MAX_MS = 12 * 60 * 60 * 1000;

export interface StartTripCardInputs {
  /**
   * active_shift_id: the Start Trip's own lock, none, or anything else (a
   * shift, an Arrived waiting to be saved).
   */
  lock: "quick" | "none" | "other";
  /** An automatic recording is open (auto_recording_active). */
  autoRecording: boolean;
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
 * The card, or null when there is no Start Trip the screen would resume. The
 * screen resumes from the start row alone, so the card follows the row: shown
 * with the Start Trip's lock, or with no lock at all (a self-heal can let the
 * lock go while the row stays, and the screen still resumes it), but never
 * over a shift, an Arrived waiting to be saved or an automatic recording.
 * Hidden with no start row (the screen would open a fresh Start Trip) or one
 * the screen would clear as stale.
 */
export function startTripCardModel(i: StartTripCardInputs): StartTripCardModel | null {
  if (i.lock === "other") return null;
  if (i.lock === "none" && i.autoRecording) return null;
  if (i.startedAtMs == null || !Number.isFinite(i.startedAtMs)) return null;
  const age = i.now - i.startedAtMs;
  if (age < 0 || age > START_TRIP_RESUME_MAX_MS) return null;
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
  | { kind: "pop"; count: number } // pop exactly this many screens to reach it
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
      return i === top ? { kind: "here" } : { kind: "pop", count: top - i };
    }
  }
  return { kind: "open" };
}

/** Two taps this close together are one: the second must not open a second screen. */
export const OPEN_START_TRIP_DEBOUNCE_MS = 1500;

export function openStartTripDue(lastOpenMs: number | null, nowMs: number): boolean {
  return lastOpenMs == null || nowMs - lastOpenMs < 0 || nowMs - lastOpenMs >= OPEN_START_TRIP_DEBOUNCE_MS;
}
