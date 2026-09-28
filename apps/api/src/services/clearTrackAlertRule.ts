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
