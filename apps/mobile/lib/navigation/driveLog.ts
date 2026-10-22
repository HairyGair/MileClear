// Read-only view of Directions' guidance sessions (navigation_drives, written
// by store.ts) for the trip recorder. lib/tracking may import this; it never
// creates the table, never writes, and never throws: no table (every phone
// that has never run Directions, every older app), an unreadable row or any
// error reads as "no sessions", which leaves the recorder exactly as it was.

import { getDatabase } from "../db";
import { parseDriveSession, DRIVE_OPEN_GRACE_MS, type DriveSession } from "./driveSessions";

/** The most sessions one read returns (newest first, then put in time order). */
const MAX_SESSIONS = 10;

/** Guidance sessions that overlap [fromMs, toMs], oldest first. */
export async function readDriveSessions(fromMs: number, toMs: number): Promise<DriveSession[]> {
  try {
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return [];
    const d = await getDatabase();
    const rows = await d.getAllAsync<Record<string, unknown>>(
      "SELECT session_id, started_at, updated_at, ended_at, end_reason, mode, passenger, truncated, destination, routes " +
        "FROM navigation_drives WHERE started_at <= ? AND COALESCE(ended_at, updated_at + ?) >= ? " +
        "ORDER BY started_at DESC LIMIT ?",
      [toMs, DRIVE_OPEN_GRACE_MS, fromMs, MAX_SESSIONS]
    );
    const out: DriveSession[] = [];
    for (const r of rows ?? []) {
      const s = parseDriveSession(r as Parameters<typeof parseDriveSession>[0]);
      if (s) out.push(s);
    }
    return out.sort((a, b) => a.startedAtMs - b.startedAtMs);
  } catch {
    return [];
  }
}
