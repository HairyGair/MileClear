// The phone's own log, attached to a missing-trip report (10 Oct 2026).
//
// Missing-trip analysis (docs/missing-trips-oct2026): 20 of 56 cases were
// drives the phone never recorded, and none could be explained, because the
// diagnostic dump keeps one row per phone, overwritten at every app open, and
// its event list had scrolled past the drive long before anyone read it. The
// app now keeps a rolling 24-hour tracking log and sends the slice around the
// reported departure WITH the report. It is stored on the report's own
// app_events row (metadata.phoneLog), so a later report or dump never
// overwrites it, and it needs no schema change.
//
// Everything here is pure: parse and bound what the phone sent, scrub it,
// and summarise it for the admin list.

import { z } from "zod";
import { scrubCoordinates, scrubDiagnosticEventData } from "@mileclear/shared";

/** Most rows one report may carry (the app sends at most 300). */
export const PHONE_LOG_MAX_ROWS = 500;
/** Longest state object kept, as JSON characters. */
export const PHONE_LOG_STATE_MAX_CHARS = 4000;

const rowSchema = z.tuple([z.string().max(40), z.string().max(100), z.string().max(1000).nullable()]);

const phoneLogSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  oldestHeld: z.string().datetime().nullable().optional(),
  truncated: z.boolean().optional(),
  rows: z.array(rowSchema).max(PHONE_LOG_MAX_ROWS),
  state: z.record(z.unknown()).optional(),
});

export type PhoneLogRow = [string, string, string | null];

export interface PhoneLog {
  from: string;
  to: string;
  oldestHeld: string | null;
  truncated: boolean;
  rows: PhoneLogRow[];
  state: Record<string, unknown> | null;
}

/**
 * Validate and bound the phone log a report carried. Returns null for anything
 * that does not fit: a bad log must never cost the driver their report, so the
 * route calls this AFTER accepting the report and simply leaves the log off.
 * Every row's payload is scrubbed of coordinates, the same as a dump's events.
 */
export function parsePhoneLog(raw: unknown): PhoneLog | null {
  if (raw == null) return null;
  const parsed = phoneLogSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  let state: Record<string, unknown> | null = null;
  if (d.state) {
    const scrubbed = scrubCoordinates(d.state) as Record<string, unknown>;
    state = JSON.stringify(scrubbed).length <= PHONE_LOG_STATE_MAX_CHARS ? scrubbed : null;
  }
  return {
    from: d.from,
    to: d.to,
    oldestHeld: d.oldestHeld ?? null,
    truncated: d.truncated ?? false,
    rows: d.rows.map(([at, event, data]) => [at, event, scrubDiagnosticEventData(data)]),
    state,
  };
}

/** The phone log stored on a report event, if it has one. Never throws. */
export function readStoredPhoneLog(metadata: unknown): PhoneLog | null {
  const m = (metadata ?? {}) as { phoneLog?: unknown };
  const p = m.phoneLog as Partial<PhoneLog> | undefined;
  if (!p || !Array.isArray(p.rows) || typeof p.from !== "string" || typeof p.to !== "string") return null;
  return {
    from: p.from,
    to: p.to,
    oldestHeld: typeof p.oldestHeld === "string" ? p.oldestHeld : null,
    truncated: p.truncated === true,
    rows: p.rows as PhoneLogRow[],
    state: p.state && typeof p.state === "object" ? (p.state as Record<string, unknown>) : null,
  };
}

export interface PhoneLogSummary {
  rows: number;
  /** Did the phone's log reach back to the start of the window? False means
   *  the drive is older than anything the phone still held. */
  covered: boolean;
  recordingsStarted: number;
  tripsSaved: number;
  dropped: number;
  dropReasons: Record<string, number>;
  movingSignals: number;
  engineStarts: number;
  appKilled: number;
  /** One plain line for the admin list. */
  line: string;
}

function dataOf(row: PhoneLogRow): Record<string, unknown> {
  if (!row[2]) return {};
  try {
    const v = JSON.parse(row[2]);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Counts that answer "what did the phone do around this drive?" at a glance. */
export function summarisePhoneLog(log: PhoneLog): PhoneLogSummary {
  let recordingsStarted = 0;
  let tripsSaved = 0;
  let dropped = 0;
  let movingSignals = 0;
  let engineStarts = 0;
  let appKilled = 0;
  const dropReasons: Record<string, number> = {};
  for (const row of log.rows) {
    const event = row[1];
    if (event === "native_recording_started" || event === "recording_started") recordingsStarted++;
    else if (event === "finalize_saved" || event === "finalize_merged") tripsSaved++;
    else if (event === "recording_dropped") {
      dropped++;
      const reason = String(dataOf(row).reason ?? "unknown");
      dropReasons[reason] = (dropReasons[reason] ?? 0) + 1;
    } else if (event === "native_motionchange" && dataOf(row).isMoving === true) movingSignals++;
    else if (event === "native_engine_started") engineStarts++;
    else if (event === "native_headless_lifecycle" && dataOf(row).event === "terminate") appKilled++;
  }
  const fromMs = Date.parse(log.from);
  const oldestMs = log.oldestHeld ? Date.parse(log.oldestHeld) : Number.NaN;
  const covered = Number.isFinite(oldestMs) && Number.isFinite(fromMs) && oldestMs <= fromMs;

  const parts: string[] = [];
  if (log.rows.length === 0) parts.push("no phone events in the window");
  else {
    parts.push(`${movingSignals} moving signal${movingSignals === 1 ? "" : "s"}`);
    parts.push(`${recordingsStarted} recording${recordingsStarted === 1 ? "" : "s"} started`);
    parts.push(`${tripsSaved} saved`);
    if (dropped > 0) {
      const reasons = Object.entries(dropReasons)
        .map(([r, n]) => (n > 1 ? `${r} x${n}` : r))
        .join(", ");
      parts.push(`${dropped} dropped (${reasons})`);
    }
    if (appKilled > 0) parts.push(`app ended by Android ${appKilled}x`);
  }
  if (!covered) parts.push("log does not reach back to the start of the window");

  return {
    rows: log.rows.length,
    covered,
    recordingsStarted,
    tripsSaved,
    dropped,
    dropReasons,
    movingSignals,
    engineStarts,
    appKilled,
    line: parts.join(", "),
  };
}

// ── Recordings the phone dropped (trip.recording_dropped) ──────────────────
//
// Since 10 Oct 2026 the phone sends one app event for every recording that
// ended without a saved trip, naming why: too short, a walk, a phantom, no
// fixes, merged into the previous trip, already saved, an error. These used
// to live only in the phone's own log, so "a start signal and no trip" (5 of
// the 56 cases) could not be counted, let alone explained.

export interface RecordingDrop {
  /** When the drive ended (or started, or was dropped), ISO. */
  at: string;
  reason: string;
  detail: string | null;
  /** The phone's own call: true when the drive's miles are not in the trip
   *  list (merged, deduped and error are false). */
  lost: boolean;
  startedAt: string | null;
  endedAt: string | null;
  distanceMiles: number | null;
  coords: number | null;
  /** When the server received it, ISO. */
  receivedAt: string;
}

export function readRecordingDrop(createdAt: Date, metadata: unknown): RecordingDrop {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const startedAt = str(m.startedAt);
  const endedAt = str(m.endedAt);
  const droppedAt = str(m.droppedAt);
  return {
    at: endedAt ?? startedAt ?? droppedAt ?? createdAt.toISOString(),
    reason: str(m.reason) ?? "unknown",
    detail: str(m.detail),
    lost: m.lost === true,
    startedAt,
    endedAt,
    distanceMiles: num(m.distanceMiles),
    coords: num(m.coords),
    receivedAt: createdAt.toISOString(),
  };
}

/** The drops whose drive time falls inside [fromMs, toMs], oldest first. */
export function dropsInWindow(
  events: ReadonlyArray<{ createdAt: Date; metadata: unknown }>,
  fromMs: number,
  toMs: number
): RecordingDrop[] {
  return events
    .map((e) => readRecordingDrop(e.createdAt, e.metadata))
    .filter((d) => {
      const t = Date.parse(d.at);
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
