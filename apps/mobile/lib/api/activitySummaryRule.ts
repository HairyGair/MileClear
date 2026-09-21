// How a day of detection events is reduced to the counts that ride along
// with a diagnostic dump. Pure so it can be tested without a device.

/**
 * Why the reason is part of the key.
 *
 * `detection_skipped` is the biggest counter in the fleet: 1,035 of them across
 * 41 Android dumps on 21 Sep 2026, and the first thing anyone looks at when a
 * driver reports a missing day. It was also the least useful number we hold.
 * The device knows perfectly well WHY it declined to record (active_shift,
 * active_quick_trip, disabled, recording_active) and writes that reason into
 * the event's `data`, but the dump summary counted by bare event name and threw
 * it away. The raw event tail still carries `data`, except 200 events is about
 * two hours on a chatty phone, so by the time the report reaches us the reasons
 * have already rolled off the end.
 *
 * So each row is counted twice: once under its bare event name, and once under
 * `<event>:<reason>` when it carries one. The bare name is deliberately kept
 * intact because every existing reader depends on it (the admin fleet and
 * cleartrack views read `activitySummary.native_recording_started` and friends,
 * and the briefing job sums by event), and the per-event totals still add up.
 */

export interface DetectionEventRow {
  event: string;
  data?: string | null;
}

/**
 * Only identifier-shaped reasons get a key of their own. Some events attach
 * ids, coordinates and timestamps to `data`, and a key per value would bloat
 * the JSON column while telling us nothing: a UUID is 36 characters, a fix has
 * a decimal point and a timestamp has colons, so all three fail this test.
 */
const REASON_KEY_PATTERN = /^[a-z0-9_-]{1,32}$/;

/**
 * A backstop against an event whose reason turns out to be high-cardinality
 * after all. Past the cap the overflow is counted under `<event>:other` rather
 * than growing the summary without limit.
 */
const MAX_REASONS_PER_EVENT = 12;

/**
 * Pull the reason out of an event's stored `data`, or null if there isn't a
 * usable one. `data` is a nullable TEXT column written by 169 call sites, so
 * treat anything that isn't a JSON object with a short string `reason` as
 * "no reason" rather than letting it break the dump.
 */
export function extractEventReason(data: string | null | undefined): string | null {
  if (!data) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const reason = (parsed as Record<string, unknown>).reason;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  return REASON_KEY_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Count a window of detection events by event name, plus a `<event>:<reason>`
 * key for every row that carries a reason. Events come out ordered by total
 * descending with each event's reasons directly underneath it, so the JSON
 * reads top-down in the admin panel without any sorting on the far end.
 */
export function summariseDetectionEvents(
  rows: readonly DetectionEventRow[]
): Record<string, number> {
  const totals = new Map<string, number>();
  const reasons = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (!row || typeof row.event !== "string" || row.event.length === 0) continue;
    totals.set(row.event, (totals.get(row.event) ?? 0) + 1);

    const reason = extractEventReason(row.data);
    if (!reason) continue;
    let perEvent = reasons.get(row.event);
    if (!perEvent) {
      perEvent = new Map();
      reasons.set(row.event, perEvent);
    }
    const key =
      perEvent.has(reason) || perEvent.size < MAX_REASONS_PER_EVENT ? reason : "other";
    perEvent.set(key, (perEvent.get(key) ?? 0) + 1);
  }

  const summary: Record<string, number> = {};
  const byCount = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  for (const [event, count] of byCount) {
    summary[event] = count;
    const perEvent = reasons.get(event);
    if (!perEvent) continue;
    for (const [reason, n] of Array.from(perEvent.entries()).sort((a, b) => b[1] - a[1])) {
      summary[`${event}:${reason}`] = n;
    }
  }
  return summary;
}
