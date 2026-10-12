// When should the ClearTrack health check post to #founder?
//
// 28 Sep 2026 (Anthony: "We need to stop these Discord messages"): the job
// re-posted its whole list whenever the set changed, every 6 hours when it
// did not, and after every restart (the dedup lived in memory). The same
// drivers came round again and again, including ones support had already
// emailed that day.
//
// Now: drivers support has contacted in the last week are left out (they are
// being handled), and the channel only hears about a driver the first time
// they are flagged in a week. No new driver, no post. The full list stays on
// /dashboard/admin/cleartrack.
//
// 12 Oct 2026: of 54 drivers flagged more than three days earlier, 43 (80%)
// recorded an automatic trip again within three days with no contact from
// support. The silent bucket is mostly nightly restarts and quiet weekends, so
// a driver is only named there once they have been silent on two job runs at
// least 24 hours apart (planSilentNaming below).

export const CLEARTRACK_QUIET_DAYS = 7;

export interface ClearTrackPlan {
  /** Flagged drivers still to show (not already being handled). */
  showIds: Set<string>;
  /** Of those, the ones #founder has not heard about this week. */
  newIds: Set<string>;
  handledCount: number;
  shouldPost: boolean;
}

export function planClearTrackAlert(
  flaggedIds: Iterable<string>,
  handledIds: ReadonlySet<string>,
  alertedIds: ReadonlySet<string>
): ClearTrackPlan {
  const showIds = new Set<string>();
  const newIds = new Set<string>();
  let handledCount = 0;
  for (const id of new Set(flaggedIds)) {
    if (handledIds.has(id)) {
      handledCount += 1;
      continue;
    }
    showIds.add(id);
    if (!alertedIds.has(id)) newIds.add(id);
  }
  return { showIds, newIds, handledCount, shouldPost: newIds.size > 0 };
}

export const SILENT_FIRST_SEEN_EVENT = "alert.cleartrack_silent_seen";
/** How long a first-seen event suppresses a new one. */
export const SILENT_SEEN_LOOKBACK_DAYS = 7;
/** A silent driver is only named once first seen at least this long ago. */
export const SILENT_CONFIRM_MS = 24 * 60 * 60 * 1000;

export interface SilentNamingPlan {
  /** Silent drivers seen on an earlier run at least SILENT_CONFIRM_MS ago: name them. */
  nameIds: Set<string>;
  /** Silent drivers with no first-seen event yet: log one, do not name them. */
  firstSeenIds: Set<string>;
  /** Seen before but not yet 24h ago: leave out, nothing to log. */
  waitingCount: number;
}

/**
 * Two-strike rule for the silent bucket. `seenAtMs` maps a user to the time of
 * their first-seen event within the lookback (earliest if several). A driver
 * who records a trip never reaches this function again, so they drop out
 * without any clean-up.
 */
export function planSilentNaming(
  silentIds: Iterable<string>,
  seenAtMs: ReadonlyMap<string, number>,
  nowMs: number
): SilentNamingPlan {
  const nameIds = new Set<string>();
  const firstSeenIds = new Set<string>();
  let waitingCount = 0;
  for (const id of new Set(silentIds)) {
    const seen = seenAtMs.get(id);
    if (seen === undefined) {
      firstSeenIds.add(id);
    } else if (nowMs - seen >= SILENT_CONFIRM_MS) {
      nameIds.add(id);
    } else {
      waitingCount += 1;
    }
  }
  return { nameIds, firstSeenIds, waitingCount };
}
