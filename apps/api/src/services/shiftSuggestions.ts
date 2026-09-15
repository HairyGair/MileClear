/**
 * Shift suggestions: find work sessions in a driver's trip history and offer
 * them as shifts.
 *
 * Of 626 drivers active in the last 30 days (15 Sep 2026) only 152 ever
 * pressed Start Shift, so the shift scorecard and everything built on shifts
 * sat unused for three quarters of the fleet. Their trips already cluster
 * into obvious evenings and days of work; this clusters them so the app can
 * ask "looks like a shift, want it graded?" instead of waiting for a button
 * press nobody makes.
 *
 * Pure: takes plain trip rows, returns candidate sessions. The route layer
 * owns the database.
 */

/** Trips further apart than this (one ends, the next starts) are separate sessions. */
export const SHIFT_SUGGESTION_MAX_GAP_MINUTES = 45;
/** Fewer trips than this is an errand, not a shift. */
export const SHIFT_SUGGESTION_MIN_TRIPS = 3;
/** A session shorter than this (first start to last end) is not offered. */
export const SHIFT_SUGGESTION_MIN_SPAN_MINUTES = 90;
/** How far back the scan looks. */
export const SHIFT_SUGGESTION_SCAN_DAYS = 14;
/** How many open suggestions a driver is shown at once. */
export const SHIFT_SUGGESTION_MAX_RESULTS = 5;

export interface ShiftSuggestionTripInput {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  distanceMiles: number;
  classification: string;
  platformTag: string | null;
  shiftId: string | null;
  isManualEntry: boolean;
}

export interface ShiftSuggestionCandidate {
  /** `${firstTripId}:${lastTripId}`; stable across scans so rows dedup. */
  key: string;
  startedAt: Date;
  endedAt: Date;
  tripIds: string[];
  tripCount: number;
  totalMiles: number;
  /** Most common non-null tag across the session's trips, else null. */
  platformTag: string | null;
}

function tripEnd(t: ShiftSuggestionTripInput): Date {
  return t.endedAt ?? t.startedAt;
}

function mostCommonPlatform(trips: ShiftSuggestionTripInput[]): string | null {
  const counts = new Map<string, number>();
  for (const t of trips) {
    if (!t.platformTag) continue;
    counts.set(t.platformTag, (counts.get(t.platformTag) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [tag, n] of counts) {
    if (n > bestCount) {
      best = tag;
      bestCount = n;
    }
  }
  return best;
}

function toCandidate(run: ShiftSuggestionTripInput[]): ShiftSuggestionCandidate | null {
  if (run.length < SHIFT_SUGGESTION_MIN_TRIPS) return null;
  const startedAt = run[0].startedAt;
  let endedAt = tripEnd(run[0]);
  for (const t of run) {
    const e = tripEnd(t);
    if (e.getTime() > endedAt.getTime()) endedAt = e;
  }
  const spanMin = (endedAt.getTime() - startedAt.getTime()) / 60000;
  if (spanMin < SHIFT_SUGGESTION_MIN_SPAN_MINUTES) return null;
  const totalMiles =
    Math.round(run.reduce((sum, t) => sum + (Number.isFinite(t.distanceMiles) ? t.distanceMiles : 0), 0) * 100) / 100;
  return {
    key: `${run[0].id}:${run[run.length - 1].id}`,
    startedAt,
    endedAt,
    tripIds: run.map((t) => t.id),
    tripCount: run.length,
    totalMiles,
    platformTag: mostCommonPlatform(run),
  };
}

/**
 * Group trips (sorted by startedAt) into sessions.
 *
 * A session is a run of trips where each starts within
 * SHIFT_SUGGESTION_MAX_GAP_MINUTES of the previous one ending. Personal trips
 * are ignored entirely: they are not counted, and the gap is measured across
 * them as if they were not there. A trip that is already in a shift breaks
 * the run and is never included, so a session the driver has already
 * recorded is not offered back to them.
 */
export function clusterTripsIntoSessions(
  trips: ShiftSuggestionTripInput[]
): ShiftSuggestionCandidate[] {
  const sorted = [...trips].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const out: ShiftSuggestionCandidate[] = [];
  let run: ShiftSuggestionTripInput[] = [];
  // Latest end seen in the current run. Trips can overlap or end out of
  // order (a manual entry typed with a generous end time), so the gap is
  // measured from the furthest point the run has reached, not the last
  // trip's own end.
  let runEnd = 0;

  const flush = () => {
    const c = toCandidate(run);
    if (c) out.push(c);
    run = [];
    runEnd = 0;
  };

  for (const t of sorted) {
    if (t.classification === "personal") continue;
    if (t.shiftId) {
      flush();
      continue;
    }
    if (run.length > 0) {
      const gapMin = (t.startedAt.getTime() - runEnd) / 60000;
      if (gapMin > SHIFT_SUGGESTION_MAX_GAP_MINUTES) flush();
    }
    run.push(t);
    runEnd = Math.max(runEnd, tripEnd(t).getTime());
  }
  flush();
  return out;
}
