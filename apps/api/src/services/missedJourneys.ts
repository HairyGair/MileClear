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
}

export interface MissedJourneySelection {
  candidates: MissedJourneyCandidate[];
  /** Gaps skipped as engine wake lag (auto B, below MISSED_WAKE_LAG_MILES). */
  wakeLagSuppressed: number;
  /** Largest crow-flies gap among the suppressed pairs, rounded to 0.1 mi. */
  wakeLagMaxMiles: number;
}

/** trips must be ordered by startedAt ascending. */
export function selectMissedJourneyCandidates(
  trips: MissedJourneyTripInput[]
): MissedJourneySelection {
  const candidates: MissedJourneyCandidate[] = [];
  let wakeLagSuppressed = 0;
  let wakeLagMaxMiles = 0;

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
    candidates.push({
      key: `${a.id}:${b.id}`,
      fromLat: a.endLat, fromLng: a.endLng,
      toLat: b.startLat, toLng: b.startLng,
      fromAddress: a.endAddress, toAddress: b.startAddress,
      departedAt: a.endedAt, arrivedAt: b.startedAt,
      estimatedMiles: Math.round(miles * 10) / 10,
    });
  }

  return {
    candidates,
    wakeLagSuppressed,
    wakeLagMaxMiles: Math.round(wakeLagMaxMiles * 10) / 10,
  };
}
