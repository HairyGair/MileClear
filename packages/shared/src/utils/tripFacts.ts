// Three small facts the server keeps about each trip (decision T-F, Oct 2026),
// so the Trips tab can explain the trips drivers don't recognise:
//
//   recordedBy      how the trip was recorded (set by the phone at create)
//   splitFromTripId the trip it was split from, with splitPart / splitPartCount
//   joinedCount     how many trips were joined to make it
//
// All three are null on trips saved before they existed, and on trips from
// app versions that don't send them. Null means "we don't know": say nothing.

/** How a trip was recorded. Set by the client on create. */
export const TRIP_RECORDED_BY = [
  "automatic",
  "start_trip",
  "shift",
  "added_by_hand",
  "missing_report",
  "web",
] as const;

export type TripRecordedBy = (typeof TRIP_RECORDED_BY)[number];

export function isTripRecordedBy(v: unknown): v is TripRecordedBy {
  return typeof v === "string" && (TRIP_RECORDED_BY as readonly string[]).includes(v);
}

/**
 * What the server stores for a new trip. The client's own answer wins; an
 * older client sends nothing, and then the only thing the server can tell for
 * sure is a trip with no route, which was typed in. Anything else stays null.
 */
export function resolveRecordedBy(
  fromClient: TripRecordedBy | null | undefined,
  isManualEntry: boolean
): TripRecordedBy | null {
  if (fromClient) return fromClient;
  return isManualEntry ? "added_by_hand" : null;
}

/** The facts as they sit on a trip row. Every one optional: old servers send none. */
export interface TripFacts {
  recordedBy?: string | null;
  splitFromTripId?: string | null;
  splitPart?: number | null;
  splitPartCount?: number | null;
  joinedCount?: number | null;
}

/** Leg k (0-based) of a split into n legs of the trip `parentId`. */
export function splitLegFacts(
  parentId: string,
  k: number,
  n: number
): { splitFromTripId: string; splitPart: number; splitPartCount: number } {
  return { splitFromTripId: parentId, splitPart: k + 1, splitPartCount: n };
}

/**
 * How many recorded trips a join is made of. A trip that was itself a join
 * counts for the trips inside it, so joining a "Joined from 2" with one more
 * says 3.
 */
export function joinedCountOf(trips: readonly { joinedCount?: number | null }[]): number {
  return trips.reduce((sum, t) => sum + (t.joinedCount != null && t.joinedCount >= 2 ? t.joinedCount : 1), 0);
}

export function isSplitTrip(t: TripFacts): boolean {
  return typeof t.splitFromTripId === "string" && t.splitFromTripId.length > 0;
}

export function isJoinedTrip(t: TripFacts): boolean {
  return t.joinedCount != null && t.joinedCount >= 2;
}

/** "Part 1 of 2", or null when the trip isn't a numbered leg. */
export function splitPartText(t: TripFacts): string | null {
  if (!isSplitTrip(t)) return null;
  const part = t.splitPart;
  const count = t.splitPartCount;
  if (part == null || count == null || !Number.isInteger(part) || !Number.isInteger(count)) return null;
  if (count < 2 || part < 1 || part > count) return null;
  return `Part ${part} of ${count}`;
}

/** How long after a drive ended does a save have to land to count as "later". */
export const SAVED_LATER_THRESHOLD_MS = 30 * 60 * 1000;

function ms(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * How long after the drive ended the server saved this trip, in ms. Null when
 * that gap says nothing about the drive: a split leg or a join is saved when
 * the driver (or the server) split or joined it, so its save time is that
 * moment, not the drive's; a trip with no end or no save time can't be read.
 */
export function tripSaveLagMs(
  t: TripFacts & {
    createdAt?: string | Date | null;
    endedAt?: string | Date | null;
  }
): number | null {
  if (isSplitTrip(t) || isJoinedTrip(t)) return null;
  const created = ms(t.createdAt);
  const ended = ms(t.endedAt);
  if (created == null || ended == null) return null;
  return created - ended;
}

/**
 * "Saved later, when your phone woke up": an automatic recording that reached
 * the server more than 30 minutes after it ended, and was neither split nor
 * joined. A trip without the facts (older trips, older servers) never says it.
 */
export function isSavedLaterTrip(
  t: TripFacts & {
    createdAt?: string | Date | null;
    endedAt?: string | Date | null;
  },
  thresholdMs: number = SAVED_LATER_THRESHOLD_MS
): boolean {
  if (t.recordedBy !== "automatic") return false;
  const lag = tripSaveLagMs(t);
  return lag != null && lag > thresholdMs;
}
