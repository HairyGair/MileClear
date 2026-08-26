// Is a drive recording RIGHT NOW, and since when?
//
// 19% of missing-trip reports in the 30 days to 24 Aug 2026 (12 of 63) were
// drives still in progress: the trip cannot be in the list because it has not
// ended, so the user reasonably reports it missing and it appears minutes
// later. Alejandro Vazquez's arrived 49 seconds after his report, Archie
// Cooper's 17 seconds after his. The app already knew — the rating prompt
// reads the same flag to avoid interrupting a drive — it just never told the
// person asking.
//
// The decision logic lives here, pure and tested, because two of its rules are
// easy to get subtly wrong and expensive when they are.

/** A fix older than this means the flag is set but nothing is arriving — a
 *  STUCK recording, which is a real failure (support playbook Class 15).
 *  Those reports must go through untouched: reassuring the user there would
 *  bury the bug we most need to hear about. */
export const LIVE_FIX_MAX_AGE_MS = 30 * 60 * 1000;

/** The same session gap the finalize uses, so "started" means this drive and
 *  not residue from the last one still sitting in the buffer. */
export const SESSION_GAP_MS = 5 * 60 * 1000;

export interface LiveRun {
  /** Epoch ms of the first fix in the current continuous run. */
  startedAt: number;
  /** Fixes counted in that run. */
  points: number;
}

/**
 * Resolve the current recording run from buffered fix timestamps.
 *
 * @param timesDesc epoch ms, newest first (the order the query returns).
 * @returns null when there is nothing to show the user: no fixes, or the
 *          newest one is old enough that the recording is stuck rather than
 *          live.
 */
export function resolveLiveRun(timesDesc: number[], now: number): LiveRun | null {
  const times = timesDesc.filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  if (now - times[0] > LIVE_FIX_MAX_AGE_MS) return null;

  let startedAt = times[0];
  let points = 1;
  for (let i = 1; i < times.length; i++) {
    if (startedAt - times[i] > SESSION_GAP_MS) break;
    startedAt = times[i];
    points += 1;
  }
  return { startedAt, points };
}

/** "47 minutes" / "1h 12m" — for a sentence, not a table. */
export function describeElapsed(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
