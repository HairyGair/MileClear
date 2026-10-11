// How the "Add a past trip" form is used (add-trip PROPOSALS 0.9, P13), on the
// existing /user/event channel (same as lib/events/tutorial). No new table:
// each one lands in app_events with its metadata.
//
//   trip_form.opened             {source, chain, prefill}
//   trip_form.saved              {msToSave, daysBack, milesSource, timeSet,
//                                 classification, classificationChosen,
//                                 overlapShown, overlapAnswer, chain, source,
//                                 fromKind, toKind, queued}
//   trip_form.left               {msOpen, hadFrom, hadTo, hadDay, hadTime, overlapShown}
//   trip_form.overlap_warned     {where, existingTripId, existingIsManual, existingSource, daysBack}
//   trip_form.overlap_answered   {answer, existingTripId}
//   trip_form.chain_tapped       {kind}   "Add the next trip" / "Add the way back"
//
// Never throws and never waits: a failed post is a lost measurement, not a
// broken screen.

import { apiRequest } from "../api/index";

export type TripFormEvent =
  | "trip_form.opened"
  | "trip_form.saved"
  | "trip_form.left"
  | "trip_form.overlap_warned"
  | "trip_form.overlap_answered"
  | "trip_form.chain_tapped";

export function trackTripForm(type: TripFormEvent, metadata?: Record<string, unknown>): void {
  try {
    apiRequest("/user/event", {
      method: "POST",
      body: JSON.stringify({ type, metadata }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/** Whole days between the trip's day and today, for "how far back". */
export function daysBack(startedAt: Date, now: Date): number {
  const a = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}
