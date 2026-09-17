// Correcting WHEN a journey began.
//
// The start time of a saved trip could not be changed at all until 17 Sep
// 2026. It was left out of the PATCH schema because it is half of the
// create-time dedup key, and the 28 Aug ask (Rachel Thorndyke) was to correct
// where a journey began, not when.
//
// Emily Russell then typed in a morning drive at 13:50, it saved at 13:50, and
// she could not move it. A hand-typed trip has no GPS breadcrumbs, so nothing
// about its time is authoritative: the driver's correction is the only truth.
// A recorded trip is different. Its start is the first breadcrumb the engine
// took, so the clock can never be moved LATER than that: the trail proves the
// car was already moving. It can be moved EARLIER. Mus (Android, 17 Sep 2026)
// drove Weymouth to Exeter with the phone asleep for the first hour; it woke
// for the last 14 minutes. He moved the start pin back to Weymouth, which
// routed the distance to 57 miles, but the start time was locked, so the
// trip read 57 miles in 14 minutes. Extending the start backwards contradicts
// nothing: the breadcrumbs still begin where and when they begin; the drive
// simply started before the phone woke.
//
// The pure decision lives here so it can be unit-tested without a database.

export interface TimeEditTrip {
  isManualEntry: boolean;
  startedAt: Date;
  endedAt: Date | null;
}

export interface TimeEditUpdates {
  startedAt?: Date;
  /** `null` clears the end; `undefined` leaves it as stored. */
  endedAt?: Date | null;
}

export type TimeEditDecision = { ok: true } | { ok: false; error: string };

/**
 * Whether the PATCH may move this trip's start time. A manual trip may move it
 * either way; a recorded trip may only move it earlier than the stored start
 * (which is already the first breadcrumb's time or earlier). Neither may put
 * it past the end the trip will have once the same PATCH has been applied.
 * A PATCH that carries no `startedAt` is always allowed through.
 */
export function startTimeChangeAllowed(
  existing: TimeEditTrip,
  updates: TimeEditUpdates
): TimeEditDecision {
  if (updates.startedAt === undefined) return { ok: true };

  if (!existing.isManualEntry && updates.startedAt.getTime() > existing.startedAt.getTime()) {
    return { ok: false, error: "A recorded trip's start time can only be moved earlier" };
  }

  const effectiveEnd = updates.endedAt === undefined ? existing.endedAt : updates.endedAt;
  if (effectiveEnd && updates.startedAt.getTime() > effectiveEnd.getTime()) {
    return { ok: false, error: "Start time cannot be after the end time" };
  }

  return { ok: true };
}
