// Recording-lifecycle events: the few detection events that explain a trip.
//
// The detection_events log keeps the newest 500 rows and a diagnostic dump
// carries the newest 200. Routine traffic (detection_skipped,
// native_motionchange, app_state_change, la_* updates, native_keepalive_*)
// fills that window in hours, so by the time a dump uploads, the events that
// say when a recording opened and closed have often scrolled off. Anthony's
// golf round on 23 Sep 2026 (a drive that stayed open for three hours) was
// invisible in his dump for exactly that reason.
//
// So lifecycle events are also written to a second table, kept for 48 hours,
// and every dump carries them alongside the newest 200. This file is the pure
// part: which events count, and how the two lists are merged. No React
// Native, no SQLite, so it runs under vitest.

export interface DumpEvent {
  recorded_at: string;
  event: string;
  data: string | null;
}

/** How long lifecycle events are kept on the phone and sent in a dump. */
export const LIFECYCLE_EVENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Most lifecycle events kept on the phone and sent in one dump. A busy
 * courier day produces well under 100; the cap only stops a runaway loop
 * from growing the table or the dump without bound.
 */
export const LIFECYCLE_EVENT_CAP = 400;

/**
 * Event names that describe a recording's life: opening, closing, why it
 * closed, shifts, the Live Activity starting, the engine booting, permission
 * going away. `*` matches any run of characters (glob, not regex); `_` is a
 * literal underscore.
 */
export const LIFECYCLE_EVENT_PATTERNS: readonly string[] = [
  "native_recording_started",
  "native_recording_finalizing",
  "finalize_*",
  "foot_stop_*",
  "gap_stop_*",
  "native_force_start_from_speed",
  "native_headless_force_start_from_speed",
  "native_speed_start_*",
  "native_motion_start_skipped_*",
  "native_on_foot_overridden_by_speed",
  "native_headless_wake_*",
  "stale_finalize_*",
  "orphan_route_finalize",
  "walk_offered_back",
  "shift_*",
  "la_*start*",
  "native_la_started",
  "native_engine_started",
  "native_engine_boot_on_launch",
  "permission_lost",
];

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`);
}

const LIFECYCLE_REGEXES = LIFECYCLE_EVENT_PATTERNS.map(globToRegExp);

/** True when an event name is part of the recording lifecycle. */
export function isLifecycleEvent(event: string): boolean {
  if (typeof event !== "string" || event.length === 0) return false;
  return LIFECYCLE_REGEXES.some((re) => re.test(event));
}

function eventKey(e: DumpEvent): string {
  return `${e.recorded_at}\u0000${e.event}\u0000${e.data ?? ""}`;
}

function timeOf(e: DumpEvent): number {
  const t = Date.parse(e.recorded_at);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/**
 * Build a dump's eventsJson: every row of `recent` (the newest N from the
 * main log), plus each lifecycle event from the last 48 hours that `recent`
 * does not already hold, capped at the newest `cap` of those.
 *
 * Sorted newest first by recorded_at, which is the order dumps have always
 * used (readers such as the in-app admin screen take the first rows as "most
 * recent"). Rows with the same timestamp keep their input order, `recent`
 * before the extra lifecycle rows. The element shape is unchanged.
 *
 * De-duplication is by (recorded_at, event, data) and count-aware: a
 * lifecycle row is dropped only as many times as an identical row appears in
 * `recent`, so two genuine identical events are not collapsed into one.
 */
export function mergeDumpEvents(
  recent: readonly DumpEvent[],
  lifecycle: readonly DumpEvent[],
  now: number,
  opts: { windowMs?: number; cap?: number } = {}
): DumpEvent[] {
  const windowMs = opts.windowMs ?? LIFECYCLE_EVENT_WINDOW_MS;
  const cap = Math.max(0, opts.cap ?? LIFECYCLE_EVENT_CAP);
  const cutoff = now - windowMs;

  const inRecent = new Map<string, number>();
  for (const e of recent) {
    const k = eventKey(e);
    inRecent.set(k, (inRecent.get(k) ?? 0) + 1);
  }

  const extras: DumpEvent[] = [];
  for (const e of lifecycle) {
    if (!isLifecycleEvent(e.event)) continue;
    const t = timeOf(e);
    if (!(t >= cutoff)) continue;
    const k = eventKey(e);
    const seen = inRecent.get(k) ?? 0;
    if (seen > 0) {
      inRecent.set(k, seen - 1);
      continue;
    }
    extras.push(e);
  }

  // Newest `cap` of the extras only; `recent` is never trimmed.
  const cappedExtras = extras
    .map((e, i) => ({ e, i }))
    .sort((a, b) => timeOf(b.e) - timeOf(a.e) || a.i - b.i)
    .slice(0, cap)
    .map(({ e }) => e);

  const all = [...recent, ...cappedExtras].map((e, i) => ({ e, i }));
  all.sort((a, b) => {
    const ta = timeOf(a.e);
    const tb = timeOf(b.e);
    if (ta !== tb) return tb > ta ? 1 : -1;
    return a.i - b.i;
  });
  return all.map(({ e }) => ({ recorded_at: e.recorded_at, event: e.event, data: e.data }));
}
