// Directions' own small store on the phone: mute, how many previews showed
// the first-time line, the safety note, recent destinations and the session
// for "Carry on to ...?". Its own table, so Directions never write the trip
// recorder's tracking_state. Nothing here is sent to the server.
//
// navigation_drives (PLAN-recording.md section 4): one row per guidance
// session with its routes, so the recorder can later see whether a GPS gap
// sat on the route being followed. Written here only; read by driveLog.ts.

import { getDatabase } from "../db";
import { addRecentDestination, type RecentDestination, type SavedSession } from "./rules";
import { DRIVE_KEEP_MS, type DriveSession } from "./driveSessions";

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
          "truncated INTEGER NOT NULL DEFAULT 0, destination TEXT NOT NULL, routes TEXT NOT NULL)"
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

/** The whole session: on start and after each reroute (the routes change). */
export async function saveDriveSession(s: DriveSession): Promise<void> {
  try {
    const d = await db();
    await d.runAsync(
      "INSERT OR REPLACE INTO navigation_drives (session_id, started_at, updated_at, ended_at, end_reason, mode, passenger, truncated, destination, routes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        s.sessionId,
        s.startedAtMs,
        s.updatedAtMs,
        s.endedAtMs,
        s.endReason,
        s.mode,
        s.passenger ? 1 : 0,
        s.truncated ? 1 : 0,
        JSON.stringify(s.destination),
        JSON.stringify(s.routes),
      ]
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

/** Sessions older than three days go. */
export async function pruneDriveSessions(nowMs: number): Promise<void> {
  try {
    const d = await db();
    await d.runAsync("DELETE FROM navigation_drives WHERE started_at < ?", [nowMs - DRIVE_KEEP_MS]);
  } catch {
    // best effort
  }
}
