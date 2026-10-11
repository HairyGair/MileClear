// A practice invite or join link opened before the driver signed in. The
// consent sheet keeps it here, and Home opens the sheet once they are in.

import { getDatabase } from "../db/index";

const KEY = "practice_pending_consent";

export interface PendingConsent {
  invite?: string;
  code?: string;
}

export async function savePendingConsent(p: PendingConsent): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [KEY, JSON.stringify(p)]);
  } catch {
    // best-effort
  }
}

/** Read and clear. */
export async function takePendingConsent(): Promise<PendingConsent | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [KEY]);
    if (!row?.value) return null;
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [KEY]);
    const p = JSON.parse(row.value) as PendingConsent;
    return p.invite || p.code ? p : null;
  } catch {
    return null;
  }
}
