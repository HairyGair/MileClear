// How long stopped before a journey is treated as OVER.
//
// User-settable, because the right answer is a property of the job, not of the
// app. Rachel Thorndyke (freelance animal care, 13 Aug 2026) does 1-20 visits a
// day stopping anywhere from 5 minutes to 3 hours, and had three separate
// journeys recorded as one long trip because the splitter only broke a
// recording where a stop exceeded 30 minutes. She proposed the setting, and
// spotted its tension herself: it cannot go very low, or a city driver sitting
// in traffic has their journey ended underneath them. Hence the floor.
//
// ⚠️ This is deliberately NOT detection.ts's BUFFER_MAX_AGE_MS, even though
// both were 30 minutes. That constant also bounds two coordinate-PRUNING paths
// (the stale detection_coordinates purge, and the carry-forward age floor).
// Driving those from a user value would mean someone who chose 5 minutes had
// their in-progress route deleted every 5 minutes. The journey boundary and the
// buffer's memory are different ideas that happened to share a number.
//
// Lives in its own module so the rule can be unit-tested: detection.ts pulls in
// the native tracking stack and cannot be imported by the test runner.

/** Merging's own window: two trips ending/starting within this of each other
 *  (and within MERGE_DISTANCE_M) are one interrupted drive. Lives here rather
 *  than in detection.ts so the boundary rule owns both halves of the decision
 *  and they cannot drift apart. */
export const MERGE_TIME_WINDOW_MS = 15 * 60 * 1000;

export const JOURNEY_END_DEFAULT_MIN = 30; // unchanged behaviour if never touched
export const JOURNEY_END_MIN_MIN = 5; // below this, traffic queues split a drive
export const JOURNEY_END_MAX_MIN = 180;

/** Clamp whatever is stored - absent, corrupt, or out of range - to a usable number. */
export function resolveJourneyEndMinutes(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return JOURNEY_END_DEFAULT_MIN;
  return Math.min(JOURNEY_END_MAX_MIN, Math.max(JOURNEY_END_MIN_MIN, Math.round(n)));
}

/**
 * The gap that separates one journey from the next.
 *
 * The merge window is capped by the same value: gluing a segment back on across
 * a gap the user calls a journey boundary would undo the split immediately.
 * Above the default, merging keeps its own 15-minute window, because a longer
 * boundary means "don't split me", not "join up distant trips".
 */
export function journeyBoundaryMs(minutes: number): { splitMs: number; mergeMs: number } {
  const splitMs = minutes * 60 * 1000;
  return { splitMs, mergeMs: Math.min(MERGE_TIME_WINDOW_MS, splitMs) };
}

/** Options offered in Settings, phrased as the stop the driver would recognise. */
export const JOURNEY_END_CHOICES: { minutes: number; label: string; hint: string }[] = [
  { minutes: 5, label: "5 minutes", hint: "Quick drops and short calls" },
  { minutes: 10, label: "10 minutes", hint: "Short visits between jobs" },
  { minutes: 20, label: "20 minutes", hint: "Appointments and longer calls" },
  { minutes: 30, label: "30 minutes", hint: "Default. Longer runs with breaks" },
  { minutes: 60, label: "1 hour", hint: "Few, long stops in a day" },
];
