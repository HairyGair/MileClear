// Directions' own small store on the phone: mute, how many previews showed
// the first-time line, the safety note, recent destinations and the session
// for "Carry on to ...?". Its own table, so Directions never write the trip
// recorder's tracking_state. Nothing here is sent to the server.

import { getDatabase } from "../db";
import { addRecentDestination, type RecentDestination, type SavedSession } from "./rules";

let ready: Promise<void> | null = null;

async function db() {
  const d = await getDatabase();
  if (!ready) {
    ready = d
      .execAsync("CREATE TABLE IF NOT EXISTS navigation_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
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
