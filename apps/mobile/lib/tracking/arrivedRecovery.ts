// The gap between "I've Arrived" and "Save Trip": the pure rules.
//
// Tapping "I've Arrived" used to tear the recording down before the driver
// had saved anything. stopQuickTripTracking() deletes shift_coordinates,
// cancelAutoRecording(true) empties detection_coordinates and the native
// store, and from that moment the only copy of the day's route was React
// state inside the open screen. A back chevron, an edge swipe or an app kill
// took the lot, with no confirmation and nothing to recover. Liam Darkin
// (15 Sep 2026), Emily Russell (16 Sep) and Matthew Booth (17 Sep) all lost a
// day that way, and a fleet check found 33 such bursts from 23 drivers in a
// fortnight.
//
// So the merged trail is now written to SQLite before anything is cleared,
// and these rules decide what happens to it: whether it is worth keeping,
// whether it should be offered back the next time the form opens, and
// whether a drive the driver threw away was big enough to be worth putting
// in front of them again as a missed journey.
//
// Pure and tested on its own, like gapStop / pauseRule / quickTripLock.

/** Reserved shift_coordinates id for the trail of an arrived-but-unsaved
 *  trip. Every read of that table is scoped by shift_id, so a reserved id
 *  is invisible to the shift and quick-trip paths. */
export const ARRIVED_PENDING_SHIFT_ID = "__arrived_pending__";

/** tracking_state key holding the trip's facts as JSON, alongside the trail. */
export const PENDING_ARRIVED_KEY = "pending_arrived_trip";

/** How long an unsaved arrived trip is still worth putting back on screen.
 *  The same 12 hours the quick-trip resume guard uses: past that the driver
 *  has moved on, and re-opening yesterday's summary would only confuse. */
export const PENDING_ARRIVED_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** A discarded recording longer than this is reported back as a missed
 *  journey rather than vanishing. Either test passes it: a long slow crawl
 *  and a short fast hop are both real drives. */
export const DISCARD_REPORT_MIN_MS = 10 * 60 * 1000;
export const DISCARD_REPORT_MIN_MILES = 1;

/** The server's recordedMiles ceiling. Clamped here so an absurd figure from
 *  a corrupted trail is trimmed rather than rejected whole. */
export const DISCARD_REPORT_MAX_MILES = 1000;

/** What the summary screen knew about the trip when the driver arrived. */
export interface PendingArrivedFacts {
  startLat: number;
  startLng: number;
  startAddress: string | null;
  endLat: number;
  endLng: number;
  endAddress: string | null;
  /** ISO. When the driver tapped Start Trip. */
  startedAt: string;
  /** ISO. When they tapped I've Arrived. */
  endedAt: string;
  distanceMiles: number | null;
  /** Wall clock at the moment the trail was written, for the age check. */
  arrivedAtMs: number;
}

/** One stored GPS fix, in the shape both the screen and SQLite use. */
export interface PendingArrivedCrumb {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
}

function isCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function msOf(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Is this arrived trip worth writing to SQLite at all?
 *
 * Both endpoints are needed: a record with no end fix can neither be restored
 * onto the summary screen nor reported as a journey. Past that the bar is
 * deliberately low, because the whole point is to keep what the driver has
 * not saved yet: any trail, or any distance at all, is kept.
 */
export function shouldPersistArrivedTrip(input: {
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  crumbCount: number;
  distanceMiles: number | null;
}): boolean {
  if (!isCoord(input.startLat, input.startLng)) return false;
  if (!isCoord(input.endLat, input.endLng)) return false;
  if (input.crumbCount >= 2) return true;
  return input.distanceMiles != null && Number.isFinite(input.distanceMiles) && input.distanceMiles > 0;
}

/**
 * Read back what was stored. A malformed or half-written row is treated as
 * nothing at all rather than throwing: a bad record must never be able to
 * wedge the trip form on open.
 */
export function parsePendingArrived(raw: string | null | undefined): PendingArrivedFacts | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (!isCoord(p.startLat, p.startLng)) return null;
  if (!isCoord(p.endLat, p.endLng)) return null;
  const startMs = msOf(p.startedAt);
  const endMs = msOf(p.endedAt);
  if (startMs == null || endMs == null || endMs < startMs) return null;
  const distance =
    typeof p.distanceMiles === "number" && Number.isFinite(p.distanceMiles) ? p.distanceMiles : null;
  return {
    startLat: p.startLat as number,
    startLng: p.startLng as number,
    startAddress: typeof p.startAddress === "string" ? p.startAddress : null,
    endLat: p.endLat as number,
    endLng: p.endLng as number,
    endAddress: typeof p.endAddress === "string" ? p.endAddress : null,
    startedAt: p.startedAt as string,
    endedAt: p.endedAt as string,
    distanceMiles: distance,
    arrivedAtMs: typeof p.arrivedAtMs === "number" ? p.arrivedAtMs : Number.NaN,
  };
}

export type PendingArrivedAction = "offer" | "expire" | "none";

/**
 * What to do with a stored arrived trip when the app or the trip form opens.
 *
 * "offer" puts the summary back on screen with its trail, so the driver can
 * Save or Discard it themselves. "expire" is for one old enough that showing
 * it would be strange; it is reported as a discarded recording on the way out
 * rather than deleted quietly. A broken or future-dated stamp offers rather
 * than expires: offering costs a driver one tap, expiring costs them a drive.
 */
export function pendingArrivedAction(
  pending: PendingArrivedFacts | null,
  now: number,
  maxAgeMs: number = PENDING_ARRIVED_MAX_AGE_MS
): PendingArrivedAction {
  if (!pending) return "none";
  const stamp = pending.arrivedAtMs;
  if (!Number.isFinite(stamp)) return "offer";
  const age = now - stamp;
  if (age < 0) return "offer";
  return age > maxAgeMs ? "expire" : "offer";
}

/** The body POST /trips/missed-journeys/recorded expects. */
export interface DiscardReport {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  departedAt: string;
  arrivedAt: string;
  recordedMiles: number;
  reason: "start_trip_discarded";
}

/**
 * Was this discarded recording big enough that losing it silently would be a
 * bug in itself? Ten minutes or a mile. Below that it is a car-park shuffle
 * or a hop the driver meant to throw away, and offering it back is noise.
 */
export function qualifiesForDiscardReport(facts: PendingArrivedFacts | null): boolean {
  return buildDiscardReport(facts) != null;
}

/**
 * Turn a discarded recording into the report that brings it back as a
 * "journey you might have missed" card. Null when it does not qualify, so
 * the caller has one decision to make rather than two.
 */
export function buildDiscardReport(facts: PendingArrivedFacts | null): DiscardReport | null {
  if (!facts) return null;
  if (!isCoord(facts.startLat, facts.startLng)) return null;
  if (!isCoord(facts.endLat, facts.endLng)) return null;
  const startMs = msOf(facts.startedAt);
  const endMs = msOf(facts.endedAt);
  if (startMs == null || endMs == null) return null;
  const durationMs = endMs - startMs;
  // The endpoint refuses arrivedAt <= departedAt, and a trip that took no
  // time is not a drive anyone can add.
  if (durationMs <= 0) return null;

  const miles =
    facts.distanceMiles != null && Number.isFinite(facts.distanceMiles) && facts.distanceMiles > 0
      ? facts.distanceMiles
      : 0;
  const longEnough = durationMs >= DISCARD_REPORT_MIN_MS;
  const farEnough = miles >= DISCARD_REPORT_MIN_MILES;
  if (!longEnough && !farEnough) return null;

  return {
    fromLat: facts.startLat,
    fromLng: facts.startLng,
    toLat: facts.endLat,
    toLng: facts.endLng,
    departedAt: new Date(startMs).toISOString(),
    arrivedAt: new Date(endMs).toISOString(),
    recordedMiles: Math.round(Math.min(miles, DISCARD_REPORT_MAX_MILES) * 100) / 100,
    reason: "start_trip_discarded",
  };
}
