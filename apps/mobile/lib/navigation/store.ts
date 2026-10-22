// Directions' own small store on the phone: mute, how many previews showed
// the first-time line, the safety note, recent destinations and the session
// for "Carry on to ...?". Its own table, so Directions never write the trip
// recorder's tracking_state. Nothing here is sent to the server.
//
// navigation_drives + navigation_drive_routes (PLAN-recording.md section 4):
// one row per guidance session and one per route it was given, so the
// recorder can later see whether a GPS gap sat on the route being followed.
// Written here only; read by driveLog.ts. A reroute adds one route row and
// closes the previous one: the earlier routes are never written again.

import { getDatabase } from "../db";
import { addRecentDestination, type RecentDestination, type SavedSession } from "./rules";
import { DRIVE_KEEP_MS, directionsModeOf, type DriveSession } from "./driveSessions";

let ready: Promise<void> | null = null;

async function db() {
  const d = await getDatabase();
  if (!ready) {
    ready = d
      .execAsync(
        "CREATE TABLE IF NOT EXISTS navigation_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
          "CREATE TABLE IF NOT EXISTS navigation_drives (" +
          "session_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, " +
          "ended_at INTEGER, end_reason TEXT, mode TEXT NOT NULL, passenger INTEGER NOT NULL DEFAULT 0, " +
          "truncated INTEGER NOT NULL DEFAULT 0, destination TEXT NOT NULL);" +
          "CREATE TABLE IF NOT EXISTS navigation_drive_routes (" +
          "session_id TEXT NOT NULL, seq INTEGER NOT NULL, route_id TEXT NOT NULL, from_ms INTEGER NOT NULL, " +
          "to_ms INTEGER, geometry TEXT NOT NULL, PRIMARY KEY (session_id, seq))"
      )
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  await ready;
  return d;
}

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const d = await db();
    const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM navigation_state WHERE key = ?", [key]);
    return row ? (JSON.parse(row.value) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    const d = await db();
    if (value === null) {
      await d.runAsync("DELETE FROM navigation_state WHERE key = ?", [key]);
      return;
    }
    await d.runAsync("INSERT OR REPLACE INTO navigation_state (key, value) VALUES (?, ?)", [key, JSON.stringify(value)]);
  } catch {
    // a preference lost, never a crash
  }
}

export const getMuted = () => read<boolean>("muted", false);
export const setMutedPref = (m: boolean) => write("muted", m);

export const getPreviewCount = () => read<number>("preview_note_count", 0);
export const bumpPreviewCount = async () => write("preview_note_count", (await getPreviewCount()) + 1);

export const getSafetySeen = () => read<boolean>("safety_seen", false);
export const setSafetySeen = () => write("safety_seen", true);

export const getUkVoiceNoteSeen = () => read<boolean>("uk_voice_note_seen", false);
export const setUkVoiceNoteSeen = () => write("uk_voice_note_seen", true);

export const getRecentDestinations = () => read<RecentDestination[]>("recent_destinations", []);
export async function rememberDestination(d: RecentDestination): Promise<void> {
  await write("recent_destinations", addRecentDestination(await getRecentDestinations(), d));
}

export const getSession = () => read<SavedSession | null>("session", null);
export const saveSession = (s: SavedSession) => write("session", s);
export const clearSession = () => write("session", null);

// ── Guidance sessions (navigation_drives) ────────────────────────────────
// Every write is best effort: a lost row means a gap is not filled from the
// route later, never a crash and never anything about the recording itself.

type Db = Awaited<ReturnType<typeof db>>;

async function insertRoute(d: Db, sessionId: string, seq: number, r: DriveSession["routes"][number]): Promise<void> {
  await d.runAsync(
    "INSERT OR REPLACE INTO navigation_drive_routes (session_id, seq, route_id, from_ms, to_ms, geometry) VALUES (?, ?, ?, ?, ?, ?)",
    [sessionId, seq, r.routeId, r.fromMs, r.toMs, JSON.stringify(r.geometry)]
  );
}

/** A new session: its row and its first route. */
export async function startDriveSession(s: DriveSession): Promise<void> {
  try {
    const d = await db();
    await d.runAsync(
      "INSERT OR REPLACE INTO navigation_drives (session_id, started_at, updated_at, ended_at, end_reason, mode, passenger, truncated, destination) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [s.sessionId, s.startedAtMs, s.updatedAtMs, s.endedAtMs, s.endReason, s.mode, s.passenger ? 1 : 0, s.truncated ? 1 : 0, JSON.stringify(s.destination)]
    );
    for (let i = 0; i < s.routes.length; i++) await insertRoute(d, s.sessionId, i, s.routes[i]);
  } catch {
    // best effort
  }
}

/** A reroute (withRoute gave `next` from `prev`): the previous route is
 *  closed and only the new one is written, never the earlier geometry. */
export async function saveDriveReroute(prev: DriveSession, next: DriveSession): Promise<void> {
  try {
    const d = await db();
    const last = prev.routes.length - 1;
    if (last >= 0 && next.routes[last]?.toMs != null) {
      await d.runAsync("UPDATE navigation_drive_routes SET to_ms = ? WHERE session_id = ? AND seq = ?", [next.routes[last].toMs, next.sessionId, last]);
    }
    if (next.routes.length > prev.routes.length) await insertRoute(d, next.sessionId, next.routes.length - 1, next.routes[next.routes.length - 1]);
    await d.runAsync("UPDATE navigation_drives SET updated_at = ?, truncated = ? WHERE session_id = ?", [next.updatedAtMs, next.truncated ? 1 : 0, next.sessionId]);
  } catch {
    // best effort
  }
}

/** The session ended (withEnd): its open route and the row are closed. */
export async function endDriveSession(s: DriveSession): Promise<void> {
  if (s.endedAtMs == null) return;
  try {
    const d = await db();
    await d.runAsync("UPDATE navigation_drive_routes SET to_ms = ? WHERE session_id = ? AND to_ms IS NULL", [s.endedAtMs, s.sessionId]);
    await d.runAsync(
      "UPDATE navigation_drives SET ended_at = ?, end_reason = ?, updated_at = ? WHERE session_id = ? AND ended_at IS NULL",
      [s.endedAtMs, s.endReason, s.updatedAtMs, s.sessionId]
    );
  } catch {
    // best effort
  }
}

/** Still being followed: a cheap stamp, never the routes again. */
export async function touchDriveSession(sessionId: string, atMs: number): Promise<void> {
  try {
    const d = await db();
    await d.runAsync("UPDATE navigation_drives SET updated_at = ? WHERE session_id = ? AND ended_at IS NULL", [atMs, sessionId]);
  } catch {
    // best effort
  }
}

/** Sessions older than three days go, with their routes. */
export async function pruneDriveSessions(nowMs: number): Promise<void> {
  try {
    const d = await db();
    const cutoff = nowMs - DRIVE_KEEP_MS;
    await d.runAsync(
      "DELETE FROM navigation_drive_routes WHERE session_id IN (SELECT session_id FROM navigation_drives WHERE started_at < ?)",
      [cutoff]
    );
    await d.runAsync("DELETE FROM navigation_drives WHERE started_at < ?", [cutoff]);
  } catch {
    // best effort
  }
}

/**
 * The server's DIRECTIONS_RECORDING as the last profile fetch gave it, kept
 * so the recorder (which never asks the network) honours the switch: off
 * means finalize and the heartbeat ignore every stored session, and the
 * stored sessions are deleted. Off never creates the tables (a phone that
 * has never used Directions keeps none); log or on does.
 */
export async function rememberDirectionsRecording(raw: unknown): Promise<void> {
  const mode = directionsModeOf(raw);
  try {
    if (mode !== "off") {
      await write("directions_recording", mode);
      return;
    }
    const d = await getDatabase();
    for (const sql of [
      "DELETE FROM navigation_drive_routes",
      "DELETE FROM navigation_drives",
      "DELETE FROM navigation_state WHERE key = 'directions_recording'",
    ]) {
      try {
        await d.runAsync(sql);
      } catch {
        // no such table: nothing to delete
      }
    }
  } catch {
    // best effort: the recorder reads a missing switch as off
  }
}
