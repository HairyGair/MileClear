// The phone's rolling 24-hour tracking log: the pure part.
//
// Missing-trip analysis, 10 Oct 2026 (docs/missing-trips-oct2026): 20 of 56
// cases were drives the phone never recorded, with permission and Automatic
// trips both on, and not one of them could be explained, because a diagnostic
// dump holds only the newest 200 events plus the recording-lifecycle rows. The
// engine's own story (did it start, did the phone say it moved, did Android end
// the app, did the power mode change) had scrolled out long before anyone
// looked.
//
// So the events that tell that story are also written to a small table of
// their own, kept for 24 hours and capped in rows. The dump carries the whole
// of it, and a missing-trip report carries the slice around the time the
// driver says they set off (see buildReportSnapshot), so every report arrives
// with the engine's own account of that drive.
//
// No React Native and no SQLite in this file, so it runs under vitest. The
// SQLite side is trackingLogStore.ts.

/** How long a row is kept on the phone. */
export const TRACKING_LOG_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Most rows kept on the phone. A busy courier day is a few hundred (two or
 * three motion changes and a dozen recording rows per drive, plus app opens);
 * the cap only stops a runaway loop growing the table or the dump.
 */
export const TRACKING_LOG_CAP = 1500;

/** Longest data payload kept per row. Almost every payload is far shorter. */
export const TRACKING_LOG_DATA_MAX = 600;

/**
 * Event names that belong in the tracking log. `*` matches any run of
 * characters. Chosen to answer "what was the engine doing at 08:15?":
 * engine starts, stops and power changes; what the phone said about motion;
 * recordings opening, closing and being dropped (with the reason); the
 * Android headless task; permission, location-services and battery-saver
 * changes; and the app coming to the front or going away.
 *
 * Deliberately NOT here: detection_skipped (the biggest counter in the system
 * and mostly benign, see diagnostic_false_signals), per-fix events, and Live
 * Activity progress updates.
 */
export const TRACKING_LOG_PATTERNS: readonly string[] = [
  // Engine
  "native_engine_*",
  "native_power_*",
  "native_slept_while_paused",
  "native_sleep_failed",
  "native_wake",
  "native_stationary_*",
  "native_keepalive_*",
  "native_boot_keepalive_armed",
  "native_location_error",
  "engine_*",
  "detection_started",
  "detection_switch_set",
  "detection_using_native_engine",
  "detection_off_discarded",
  "drive_paused",
  "drive_resumed",
  // Motion and the starts it leads to
  "native_motionchange",
  "native_motionchange_error",
  "native_motion_start_skipped_*",
  "native_on_foot_overridden_by_speed",
  "native_force_start_from_speed",
  "native_speed_start_*",
  // Android headless task
  "native_headless_*",
  // Recording life
  "native_recording_*",
  "native_heartbeat_finalize",
  "native_heartbeat_error",
  "native_buffer_*",
  "native_reconcile_error",
  "native_open_skipped_*",
  "recording_started",
  "recording_dropped",
  "finalize_*",
  "foot_stop_*",
  "gap_stop_*",
  "stale_finalize_*",
  "orphan_*",
  "deferred_buffer_*",
  "merge_attempted",
  "not_driving_*",
  "shift_*",
  "background_fetch_*",
  "background_upkeep*",
  // Phone state
  "permission_*",
  "provider_change",
  "power_save_change",
  "app_state_change",
];

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`);
}

const TRACKING_LOG_REGEXES = TRACKING_LOG_PATTERNS.map(globToRegExp);

/** True when an event name belongs in the tracking log at all. */
export function isTrackingLogEvent(event: string): boolean {
  if (typeof event !== "string" || event.length === 0) return false;
  return TRACKING_LOG_REGEXES.some((re) => re.test(event));
}

/**
 * Should this particular row be written? The name decides, except for
 * app_state_change: iOS reports "inactive" whenever Control Centre or a
 * notification banner is pulled down, which is noise here. Only the moves
 * to the front ("active") and away ("background") say anything about
 * whether the app was alive for a drive.
 */
export function shouldWriteTrackingLog(event: string, data: string | null): boolean {
  if (!isTrackingLogEvent(event)) return false;
  if (event !== "app_state_change") return true;
  if (!data) return false;
  try {
    const parsed = JSON.parse(data) as { to?: unknown };
    return parsed.to === "active" || parsed.to === "background";
  } catch {
    return false;
  }
}

/** Trim a payload to the stored maximum. Null stays null. */
export function clampTrackingLogData(data: string | null): string | null {
  if (data == null) return null;
  return data.length > TRACKING_LOG_DATA_MAX ? data.slice(0, TRACKING_LOG_DATA_MAX) : data;
}

// ── Missing-trip report snapshot ────────────────────────────────────────────

export interface LogRow {
  recorded_at: string;
  event: string;
  data: string | null;
}

/** Compact wire row: [ISO time, event, data]. */
export type SnapshotRow = [string, string, string | null];

/** How far either side of the reported departure the snapshot reaches. */
export const SNAPSHOT_BEFORE_MS = 2 * 60 * 60 * 1000;
export const SNAPSHOT_AFTER_MS = 4 * 60 * 60 * 1000;
/** Most rows one report carries, and the longest data string per row. */
export const SNAPSHOT_ROW_CAP = 300;
export const SNAPSHOT_DATA_MAX = 240;

export interface ReportSnapshot {
  /** The window asked for, ISO. */
  from: string;
  to: string;
  /** The oldest row the phone still held in either log, ISO, or null when
   *  both were empty. Says whether the window was covered at all: a drive
   *  reported two days later is older than the log. */
  oldestHeld: string | null;
  /** Rows in the window, oldest first. */
  rows: SnapshotRow[];
  /** True when the window held more than SNAPSHOT_ROW_CAP rows and the
   *  middle was dropped (the first and last halves are kept). */
  truncated: boolean;
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.NaN;
}

/**
 * The slice of the phone's logs around a reported departure, for a
 * missing-trip report.
 *
 * Takes both the 24-hour tracking log and the 48-hour lifecycle log, because
 * a driver often reports the next day and the lifecycle rows outlive the
 * tracking log. Identical rows (same time, name and payload) appear once.
 * When the window is busier than the cap, the start and the end are kept and
 * the middle is dropped: the start says whether the drive was noticed, the
 * end says what became of it.
 */
export function buildReportSnapshot(
  departAtMs: number,
  trackingLog: readonly LogRow[],
  lifecycle: readonly LogRow[],
  opts: { beforeMs?: number; afterMs?: number; cap?: number; dataMax?: number } = {}
): ReportSnapshot {
  const beforeMs = opts.beforeMs ?? SNAPSHOT_BEFORE_MS;
  const afterMs = opts.afterMs ?? SNAPSHOT_AFTER_MS;
  const cap = Math.max(2, opts.cap ?? SNAPSHOT_ROW_CAP);
  const dataMax = opts.dataMax ?? SNAPSHOT_DATA_MAX;
  const fromMs = departAtMs - beforeMs;
  const toMs = departAtMs + afterMs;

  let oldest = Number.POSITIVE_INFINITY;
  const seen = new Set<string>();
  const inWindow: Array<{ t: number; row: LogRow }> = [];
  for (const row of [...trackingLog, ...lifecycle]) {
    const t = timeOf(row.recorded_at);
    if (!Number.isFinite(t)) continue;
    if (t < oldest) oldest = t;
    if (t < fromMs || t > toMs) continue;
    const key = `${row.recorded_at}\u0000${row.event}\u0000${row.data ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inWindow.push({ t, row });
  }
  inWindow.sort((a, b) => a.t - b.t);

  let kept = inWindow;
  let truncated = false;
  if (inWindow.length > cap) {
    const head = Math.ceil(cap / 2);
    const tail = cap - head;
    kept = [...inWindow.slice(0, head), ...inWindow.slice(inWindow.length - tail)];
    truncated = true;
  }

  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    oldestHeld: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null,
    rows: kept.map(({ row }) => [
      row.recorded_at,
      row.event,
      row.data == null ? null : row.data.length > dataMax ? row.data.slice(0, dataMax) : row.data,
    ]),
    truncated,
  };
}
