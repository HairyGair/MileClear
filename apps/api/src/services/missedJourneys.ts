/**
 * Missed-journey candidate selection (pure, unit-tested).
 *
 * A spatial gap between two CONSECUTIVE captured trips implies an uncaptured
 * drive: trip A ended at one place, the next trip B started somewhere else,
 * with a plausible time gap and (by consecutive ordering) no trip between.
 *
 * Wake lag: the auto engine needs roughly 0.3-0.4 mi of driving before it
 * wakes and arms, so an auto-captured trip B routinely "starts" a few hundred
 * metres down the road from where the car actually left. For a user doing
 * short hops between visits that turns EVERY consecutive pair into a gap of
 * about 0.3 mi (Rachel, 25 Aug 2026: five "Home -> visit 0.3 mi" proposals in
 * one day). Those are not missing journeys; they are the first stretch of
 * trip B, which the start-extension fix reattaches to B. Proposing them as
 * separate trips double-counts the miles and mislabels a drive-past as a
 * visit. So for an auto-captured B the floor is MISSED_WAKE_LAG_MILES; a gap
 * below it is treated as wake lag and skipped. A manual B has no wake lag
 * (the user typed the real start), so the old MISSED_MIN_MILES floor applies.
 */
import { haversineDistance } from "@mileclear/shared";

export const MISSED_MIN_GAP_MIN = 5; // below this it's GPS jitter at one stop, not a drive
export const MISSED_MAX_GAP_MIN = 24 * 60; // beyond a day the two trips aren't one journey
export const MISSED_MIN_MILES = 0.3; // crow-flies; matches the phantom-trip floor (manual B)
export const MISSED_WAKE_LAG_MILES = 0.6; // crow-flies; auto B gaps below this are engine wake lag

/**
 * A distance floor is the wrong instrument for wake lag: the engine does
 * not wake after a fixed number of metres, it wakes when it notices, and on
 * a phone that took its time that is a mile or two into the drive. Anthony,
 * 3 Sep 2026: "they're never trips but they always seem to be the very
 * beginning of a trip." Fleet check the same evening: of 358 proposals whose
 * next trip was auto-captured, 251 had that trip ALREADY MOVING at its first
 * fix - the gap was its opening stretch, not a separate drive - and 38 of
 * the 49 accepted proposals were those, so the miles went in twice.
 *
 * The first fix knows. A car that is doing 20 mph at the moment recording
 * starts did not start there. So an auto B that was moving at its first fix
 * is treated as wake lag up to this crow-flies gap; beyond it the gap is
 * long enough to contain a real drive as well, and the offer stays.
 */
export const MISSED_MOVING_AT_WAKE_MAX_MILES = 5;
/** m/s reported by the first fix, or mph implied by the first two. */
export const MOVING_AT_WAKE_SPEED_MPS = 4; // ~9 mph
export const MOVING_AT_WAKE_IMPLIED_MPH = 9;

export interface MissedJourneyTripInput {
  id: string;
  startLat: number;
  startLng: number;
  startAddress: string | null;
  endLat: number | null;
  endLng: number | null;
  endAddress: string | null;
  startedAt: Date;
  endedAt: Date | null;
  isManualEntry: boolean;
  /** Was the vehicle already moving when this trip's recording began?
   *  null/undefined when unknown (no breadcrumbs loaded, manual entry). */
  movingAtFirstFix?: boolean | null;
}

export interface FirstFixInput {
  lat: number;
  lng: number;
  /** m/s as stored (RNBG convention) or null for old rows. */
  speed: number | null;
  recordedAt: Date;
}

/**
 * Judge motion at the start of a recording from its first two fixes: the
 * stored speed of the first, or the displacement over the interval to the
 * second. null when there is nothing to judge from.
 */
export function isMovingAtFirstFix(fixes: FirstFixInput[]): boolean | null {
  if (fixes.length === 0) return null;
  const first = fixes[0];
  if (first.speed != null && first.speed >= MOVING_AT_WAKE_SPEED_MPS) return true;
  if (fixes.length < 2) return first.speed != null ? false : null;
  const second = fixes[1];
  const hours = (second.recordedAt.getTime() - first.recordedAt.getTime()) / 3600000;
  if (!(hours > 0)) return first.speed != null ? false : null;
  const impliedMph = haversineDistance(first.lat, first.lng, second.lat, second.lng) / hours;
  return impliedMph >= MOVING_AT_WAKE_IMPLIED_MPH;
}

export interface MissedJourneyCandidate {
  key: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  fromAddress: string | null;
  toAddress: string | null;
  departedAt: Date;
  arrivedAt: Date;
  estimatedMiles: number;
  /** "gap": a hole between two trips that may hold an uncaptured drive.
   *  "trip_start": the next trip was already moving when it began
   *  recording, so this is ITS opening stretch; accepting extends that
   *  trip backwards rather than creating a separate one. */
  kind: "gap" | "trip_start";
  /** The trip a "trip_start" offer extends (B). */
  tripId: string;
}

export interface MissedJourneySelection {
  candidates: MissedJourneyCandidate[];
  /** Gaps skipped as engine wake lag (auto B, below MISSED_WAKE_LAG_MILES). */
  wakeLagSuppressed: number;
  /** Largest crow-flies gap among the suppressed pairs, rounded to 0.1 mi. */
  wakeLagMaxMiles: number;
  /** Pairs offered as the start of B rather than a separate drive. */
  tripStartOffers: number;
}

/** trips must be ordered by startedAt ascending. */
export function selectMissedJourneyCandidates(
  trips: MissedJourneyTripInput[]
): MissedJourneySelection {
  const candidates: MissedJourneyCandidate[] = [];
  let wakeLagSuppressed = 0;
  let wakeLagMaxMiles = 0;
  let tripStartOffers = 0;

  for (let i = 0; i < trips.length - 1; i++) {
    const a = trips[i];
    const b = trips[i + 1];
    if (a.endLat == null || a.endLng == null || a.endedAt == null) continue;
    const gapMin = (b.startedAt.getTime() - a.endedAt.getTime()) / 60000;
    if (gapMin < MISSED_MIN_GAP_MIN || gapMin > MISSED_MAX_GAP_MIN) continue;
    const miles = haversineDistance(a.endLat, a.endLng, b.startLat, b.startLng);
    if (miles < MISSED_MIN_MILES) continue;
    if (!b.isManualEntry && miles < MISSED_WAKE_LAG_MILES) {
      wakeLagSuppressed++;
      if (miles > wakeLagMaxMiles) wakeLagMaxMiles = miles;
      continue;
    }
    const isTripStart =
      !b.isManualEntry && b.movingAtFirstFix === true && miles < MISSED_MOVING_AT_WAKE_MAX_MILES;
    if (isTripStart) tripStartOffers++;
    candidates.push({
      key: `${a.id}:${b.id}`,
      fromLat: a.endLat, fromLng: a.endLng,
      toLat: b.startLat, toLng: b.startLng,
      fromAddress: a.endAddress, toAddress: b.startAddress,
      departedAt: a.endedAt, arrivedAt: b.startedAt,
      estimatedMiles: Math.round(miles * 10) / 10,
      kind: isTripStart ? "trip_start" : "gap",
      tripId: b.id,
    });
  }

  return {
    candidates,
    wakeLagSuppressed,
    wakeLagMaxMiles: Math.round(wakeLagMaxMiles * 10) / 10,
    tripStartOffers,
  };
}
