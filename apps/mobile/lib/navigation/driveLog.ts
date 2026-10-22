// Read-only view of Directions' guidance sessions (navigation_drives and
// navigation_drive_routes, written by store.ts) for the trip recorder.
// lib/tracking may import this; it never creates a table, never writes, and
// never throws: no table (every phone that has never run Directions, every
// older app), an unreadable row or any error reads as "no sessions" and
// "switched off", which leaves the recorder exactly as it was.

import { getDatabase } from "../db";
import {
  directionsModeOf,
  parseDriveSession,
  DRIVE_OPEN_GRACE_MS,
  type DirectionsRecordingMode,
  type DriveRouteRow,
  type DriveSession,
} from "./driveSessions";

/** The most sessions one read returns (newest first, then put in time order). */
const MAX_SESSIONS = 10;

/** The server's DIRECTIONS_RECORDING as the last profile fetch stored it
 *  (store.rememberDirectionsRecording). Missing or unreadable: off. */
export async function readDirectionsRecordingMode(): Promise<DirectionsRecordingMode> {
  try {
    const d = await getDatabase();
    const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM navigation_state WHERE key = 'directions_recording'");
    return row ? directionsModeOf(JSON.parse(row.value)) : "off";
  } catch {
    return "off";
  }
}

/** Guidance sessions that overlap [fromMs, toMs], oldest first. */
export async function readDriveSessions(fromMs: number, toMs: number): Promise<DriveSession[]> {
  try {
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return [];
    const d = await getDatabase();
    const rows = await d.getAllAsync<Record<string, unknown>>(
      "SELECT session_id, started_at, updated_at, ended_at, end_reason, mode, passenger, truncated, destination " +
        "FROM navigation_drives WHERE started_at <= ? AND COALESCE(ended_at, updated_at + ?) >= ? " +
        "ORDER BY started_at DESC LIMIT ?",
      [toMs, DRIVE_OPEN_GRACE_MS, fromMs, MAX_SESSIONS]
    );
    const out: DriveSession[] = [];
    for (const r of rows ?? []) {
      const routes = await d.getAllAsync<DriveRouteRow>(
        "SELECT seq, route_id, from_ms, to_ms, geometry FROM navigation_drive_routes WHERE session_id = ? ORDER BY seq",
        [r.session_id as string]
      );
      const s = parseDriveSession(r as Parameters<typeof parseDriveSession>[0], routes ?? []);
      if (s) out.push(s);
    }
    return out.sort((a, b) => a.startedAtMs - b.startedAtMs);
  } catch {
    return [];
  }
}
