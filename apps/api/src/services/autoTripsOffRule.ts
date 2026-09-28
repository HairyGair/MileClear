/**
 * What changes when a driver has switched automatic trips off (pure,
 * unit-tested).
 *
 * 28 Sep 2026, a shift-only driver: Drive detection was off on their phone,
 * yet they were offered "journeys to check" for private drives between shifts
 * and the evening push said "2 walks ignored". The switch lived only on the
 * phone, so the server guessed at drives the driver had chosen not to record.
 * The heartbeat now reports it as User.driveDetectionEnabled.
 *
 * null means unknown (an app too old to report the switch) and is treated as
 * on, which is how every driver was treated before.
 *
 * With automatic trips off:
 *   - no gap / trip_start offers: a gap between two shifts is the driver's
 *     own time, not a missed drive;
 *   - no recorded / dropped_walk / dropped_phantom offers: those are drives the
 *     automatic engine made and threw away, and the driver asked it not to;
 *   - dropped_start_trip still shows: the driver pressed Start Trip
 *     themselves and the recording was thrown away, so it is theirs to keep;
 *   - the evening push says nothing about walks.
 */

import type { DigestCounts } from "../jobs/eveningDigest.js";

/** True only when the phone has told us automatic trips are off. */
export function autoTripsOff(driveDetectionEnabled: boolean | null | undefined): boolean {
  return driveDetectionEnabled === false;
}

/** Offer sources that still show when automatic trips are off. */
export const SOURCES_KEPT_WHEN_AUTO_TRIPS_OFF: ReadonlySet<string> = new Set(["dropped_start_trip"]);

/** Whether a "journey to check" of this source may be stored or shown. */
export function missedJourneySourceAllowed(
  source: string,
  driveDetectionEnabled: boolean | null | undefined,
): boolean {
  if (!autoTripsOff(driveDetectionEnabled)) return true;
  return SOURCES_KEPT_WHEN_AUTO_TRIPS_OFF.has(source);
}

/**
 * The evening digest counts for one driver, or null when there is nothing
 * left worth a push. With automatic trips off the walk count goes, and a day
 * whose only news was walks sends nothing at all ("Today: no trips." helps
 * nobody).
 */
export function digestCountsFor(
  c: DigestCounts,
  driveDetectionEnabled: boolean | null | undefined,
): DigestCounts | null {
  if (!autoTripsOff(driveDetectionEnabled)) return c;
  const out = { ...c, walks: 0 };
  if (out.trips === 0 && out.unclassified === 0) return null;
  return out;
}
