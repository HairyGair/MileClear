/**
 * Computes the optional richness fields for updateLiveActivity():
 *   - dailyTotalMiles  (sum of today's trip distances, local SQLite)
 *   - milestoneText    (proximity to next mileage milestone)
 *   - earningsTodayPence (sum of today's earnings, local SQLite)
 *
 * Cheap enough to call on every periodic LA update — all three queries
 * are user-scoped, indexed, and small. We cache the results for 60 seconds
 * to avoid burning the on-device DB on a fast GPS tick loop, but don't
 * cache aggressively because the values shift while the user is driving.
 */

import { MILESTONE_MILES } from "@mileclear/shared";
import { getDatabase } from "../db";

interface LiveActivityContext {
  dailyTotalMiles: number;
  milestoneText: string | null;
  earningsTodayPence: number | null;
}

const CACHE_TTL_MS = 60_000;
let cached: { value: LiveActivityContext; computedAt: number } | null = null;

/**
 * Get the live-activity context for the current user. Reads from local
 * SQLite (no network). Returns zeros / nulls on any error so the live
 * activity continues showing the basic stats.
 */
export async function getLiveActivityContext(args: {
  /** Distance currently captured on the in-progress trip, in miles.
   *  Added to today's pre-trip total so the "TODAY" subtitle reflects
   *  the live state, not just historical trips. */
  currentTripMiles: number;
  /** When true, also include earnings tally (only used on shift LAs). */
  includeEarnings?: boolean;
  /** User's all-time business + personal miles, for milestone calc.
   *  When omitted we skip the milestone subtitle. */
  lifetimeMiles?: number;
}): Promise<LiveActivityContext> {
  const now = Date.now();
  if (cached && now - cached.computedAt < CACHE_TTL_MS) {
    // Refresh the live trip portion only; pre-trip totals don't change.
    return {
      ...cached.value,
      dailyTotalMiles: cached.value.dailyTotalMiles + args.currentTripMiles,
    };
  }

  let dailyPreTripMiles = 0;
  let earningsTodayPence: number | null = null;

  try {
    const db = await getDatabase();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startIso = startOfDay.toISOString();

    const milesRow = await db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(distance_miles), 0) as total
         FROM trips
         WHERE started_at >= ? AND COALESCE(is_phantom_trip, 0) = 0`,
      [startIso]
    );
    dailyPreTripMiles = milesRow?.total ?? 0;

    if (args.includeEarnings) {
      const startDateOnly = startIso.slice(0, 10);
      const earningsRow = await db.getFirstAsync<{ total: number | null }>(
        `SELECT COALESCE(SUM(amount_pence), 0) as total
           FROM earnings
           WHERE period_start >= ?`,
        [startDateOnly]
      );
      earningsTodayPence = earningsRow?.total ?? 0;
    }
  } catch {
    // SQLite read failed (rare) — fall through with defaults.
  }

  const milestoneText = args.lifetimeMiles
    ? milestoneTextFor(args.lifetimeMiles + dailyPreTripMiles + args.currentTripMiles)
    : null;

  const ctx: LiveActivityContext = {
    dailyTotalMiles: dailyPreTripMiles + args.currentTripMiles,
    milestoneText,
    earningsTodayPence,
  };

  cached = {
    value: { ...ctx, dailyTotalMiles: dailyPreTripMiles },
    computedAt: now,
  };

  return ctx;
}

/**
 * Build a human-readable milestone proximity message, or null when the
 * user is more than ~50 miles from the next milestone (otherwise the
 * subtitle would always be on, defeating the point of "look forward to").
 */
export function milestoneTextFor(currentMiles: number): string | null {
  for (const m of MILESTONE_MILES) {
    if (m <= currentMiles) continue;
    const remaining = m - currentMiles;
    if (remaining > 50) return null;
    if (remaining < 1) {
      return `${m.toLocaleString("en-GB")} mi within reach!`;
    }
    return `${remaining.toFixed(remaining >= 10 ? 0 : 1)} mi to ${m.toLocaleString("en-GB")}`;
  }
  return null;
}

/** Test-only: clear the in-memory cache between tests. */
export function resetLiveActivityContextCache(): void {
  cached = null;
}
