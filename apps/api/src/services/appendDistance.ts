// What a trip's distance should be after the phone appends breadcrumbs to it.
//
// The phone PATCHes its own cumulative figure with each append and the server
// stored it. Katy, 14 Oct 2026 (trip b7b5f5fe): a 2.25-mile drive took two
// leftover recordings carrying a fix pinned at her home, and the stored figure
// became 6.90 miles while the trail, with that fix filtered out, still came to
// about 2.25. This checks the figure against the stored trail, filtered the
// same way the phone filters a recording, and only ever brings it DOWN.

import { filterTraceOutliers } from "@mileclear/shared";
import { trailDistanceMiles } from "./tripSplit.js";

/** The client's figure must be more than this many miles over the trail... */
export const APPEND_EXCESS_MIN_MILES = 0.5;
/** ...and more than this multiple of it. The phone may legitimately send more
 *  than the straight-line trail: bestTraceDistance accepts a road map-match of
 *  up to 1.5 times the haversine sum, and a late start or an edited end adds a
 *  routed stretch. Anything inside that is left alone. */
export const APPEND_EXCESS_MAX_RATIO = 1.5;

export interface StoredFix {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: Date;
}

export type AppendDistanceDecision =
  | { recompute: false; reason: string }
  | {
      recompute: true;
      reason: "outlier_inflated";
      clientMiles: number;
      trailMiles: number;
      rawTrailMiles: number;
      coords: number;
      dropped: number;
    };

/**
 * Should a trip's stored distance be replaced by its filtered trail distance?
 * Only when the filter actually threw fixes out (evidence of a bad fix, not
 * just a winding road), the client's figure is over the filtered trail by more
 * than APPEND_EXCESS_MIN_MILES and APPEND_EXCESS_MAX_RATIO, and the result is
 * lower. Never raises a distance.
 */
export function decideAppendDistance(clientMiles: number, trail: ReadonlyArray<StoredFix>): AppendDistanceDecision {
  if (!Number.isFinite(clientMiles) || clientMiles <= 0) return { recompute: false, reason: "no_client_miles" };
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
  if (kept.length === fixes.length) return { recompute: false, reason: "nothing_filtered" };
  if (kept.length < 2) return { recompute: false, reason: "too_few_kept" };
  const trailMiles = trailDistanceMiles(kept);
  if (!(trailMiles > 0)) return { recompute: false, reason: "no_trail_miles" };
  if (clientMiles - trailMiles <= APPEND_EXCESS_MIN_MILES) return { recompute: false, reason: "within_miles" };
  if (clientMiles <= trailMiles * APPEND_EXCESS_MAX_RATIO) return { recompute: false, reason: "within_ratio" };
  return {
    recompute: true,
    reason: "outlier_inflated",
    clientMiles,
    trailMiles,
    rawTrailMiles: trailDistanceMiles(fixes),
    coords: fixes.length,
    dropped: fixes.length - kept.length,
  };
}
