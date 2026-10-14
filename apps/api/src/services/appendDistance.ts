// What a trip's distance should be after the phone appends breadcrumbs to it.
//
// The phone PATCHes its own cumulative figure with each append and the server
// stored it. Katy, 14 Oct 2026 (trip b7b5f5fe): a 2.25-mile drive took two
// leftover recordings carrying a fix pinned at her home, and the stored figure
// became 6.90 miles while the trail, with that fix filtered out, still came to
// about 2.25.
//
// The phone's figure is usually MORE than the straight-line trail for good
// reasons: a road map-match (up to 1.5x), a start-to-end route when matching
// fails, a late-start or missed-journey stretch routed in front of the trail
// (2x to 4x of that stretch), a start or end moved by the driver. None of that
// is in the trail, so the trail is never the answer on its own. All this takes
// off is the distance the outlier filter actually REMOVED from the trail, and
// only when the phone's figure is big enough to have counted those jumps.
//
// Each cut is recorded on the trip (gpsQuality.appendOutlierCut), because the
// phone copies the lowered figure back (sync/hydrate) and sends it with its
// next merge: the same jumps are still in the trail and must not come off
// twice. Only jumps removed since the last cut count.

import { filterTraceOutliers } from "@mileclear/shared";
import { trailDistanceMiles } from "./tripSplit.js";

/** The filter must remove at least this many NEW miles of jumps. */
export const APPEND_MIN_REMOVED_MILES = 0.5;

export interface StoredFix {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: Date;
}

export interface AppendDistanceTrip {
  gpsQuality: unknown;
  /** Set when anything has moved the start (driver edit, late start). */
  originalStartLat: number | null;
  isManualEntry: boolean;
}

/** What earlier cuts took off: the jump miles accounted for so far, and the
 *  last cut's figures (a replayed PATCH sends fromMiles again). */
export interface AppendOutlierCut {
  removedMiles: number;
  fromMiles: number;
  toMiles: number;
}

export type AppendDistanceDecision =
  | { recompute: false; reason: string }
  | {
      recompute: true;
      reason: "outlier_inflated" | "replayed_inflated";
      clientMiles: number;
      newMiles: number;
      trailMiles: number;
      rawTrailMiles: number;
      /** Jump miles the filter removes from the whole trail now. */
      removedMiles: number;
      /** ...of which this cut accounts for (0 on a replay). */
      newlyRemovedMiles: number;
      coords: number;
      dropped: number;
      /** Write this to gpsQuality.appendOutlierCut. */
      cut: AppendOutlierCut;
    };

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** The trip's record of earlier cuts, or null. */
export function readAppendOutlierCut(gpsQuality: unknown): AppendOutlierCut | null {
  const c = asObject(asObject(gpsQuality).appendOutlierCut);
  const removedMiles = Number(c.removedMiles);
  const fromMiles = Number(c.fromMiles);
  const toMiles = Number(c.toMiles);
  if (![removedMiles, fromMiles, toMiles].every(Number.isFinite)) return null;
  return { removedMiles, fromMiles, toMiles };
}

/** A distance the server, the driver or an admin set on purpose, with miles
 *  that are not in the trail. Left alone. */
export function hasSetDistanceMarker(trip: AppendDistanceTrip): string | null {
  if (trip.isManualEntry) return "manual";
  if (trip.originalStartLat != null) return "start_moved";
  const gq = asObject(trip.gpsQuality);
  if (gq.lateStartBackfill != null) return "late_start";
  if (gq.startExtendedSource != null || gq.startExtendedMiles != null) return "start_extended";
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Take off the jump miles the outlier filter removes from the stored trail
 * that no earlier cut has taken off, when that is at least
 * APPEND_MIN_REMOVED_MILES, the phone's figure is long enough to have counted
 * them, and the trip carries no distance set on purpose. Never below the
 * filtered trail, never up. A replay of the PATCH an earlier cut acted on gets
 * that cut's result again.
 */
export function decideAppendDistance(
  clientMiles: number,
  trail: ReadonlyArray<StoredFix>,
  trip: AppendDistanceTrip
): AppendDistanceDecision {
  const marker = hasSetDistanceMarker(trip);
  if (marker) return { recompute: false, reason: marker };
  if (!Number.isFinite(clientMiles) || clientMiles <= 0) return { recompute: false, reason: "no_client_miles" };
  const prior = readAppendOutlierCut(trip.gpsQuality);
  const fixes = trail
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.recordedAt instanceof Date && Number.isFinite(c.recordedAt.getTime()))
    .slice()
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
    .map((c) => ({
      lat: c.lat,
      lng: c.lng,
      speed: c.speed,
      accuracy: c.accuracy,
      recorded_at: c.recordedAt.toISOString(),
    }));
  if (fixes.length < 2) return { recompute: false, reason: "too_few_fixes" };
  const kept = filterTraceOutliers(fixes);
  if (kept.length < 2) return { recompute: false, reason: "too_few_kept" };
  const rawTrailMiles = trailDistanceMiles(fixes);
  const trailMiles = trailDistanceMiles(kept);
  const removedMiles = round2(rawTrailMiles - trailMiles);
  const base = { clientMiles, trailMiles, rawTrailMiles, removedMiles, coords: fixes.length, dropped: fixes.length - kept.length };

  // The same PATCH again (the sync queue replays it): it carries the figure
  // the last cut acted on, so it gets the same answer.
  if (prior && clientMiles === prior.fromMiles && prior.toMiles < clientMiles) {
    return { recompute: true, reason: "replayed_inflated", ...base, newMiles: prior.toMiles, newlyRemovedMiles: 0, cut: prior };
  }

  const alreadyRemoved = prior?.removedMiles ?? 0;
  const newlyRemovedMiles = round2(removedMiles - alreadyRemoved);
  if (newlyRemovedMiles < APPEND_MIN_REMOVED_MILES) return { recompute: false, reason: "little_removed" };
  // The phone filtered its own segments, so a jump the server sees may never
  // have been in the phone's figure. Only a figure at least as long as the
  // raw trail, less what earlier cuts took off, can have counted it.
  if (clientMiles < rawTrailMiles - alreadyRemoved) return { recompute: false, reason: "client_below_raw_trail" };
  const newMiles = round2(Math.max(trailMiles, clientMiles - newlyRemovedMiles));
  if (!(newMiles < clientMiles)) return { recompute: false, reason: "would_not_lower" };
  return {
    recompute: true,
    reason: "outlier_inflated",
    ...base,
    newMiles,
    newlyRemovedMiles,
    cut: { removedMiles: round2(alreadyRemoved + newlyRemovedMiles), fromMiles: clientMiles, toMiles: newMiles },
  };
}
