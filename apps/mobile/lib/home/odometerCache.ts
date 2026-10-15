// The Home odometer card's last known figure, kept on this phone (tracking_state)
// so the card still shows something with no signal. Saved with the account it
// belongs to and removed on sign out, so the next driver on the phone never
// sees someone else's vehicles. Every call is best-effort and never throws.

import { getDatabase } from "../db/index";
import { parseHomeOdometerCache, serialiseHomeOdometerCache, type HomeOdometerRow } from "./odometerCard";

export const HOME_ODOMETER_CACHE_KEY = "home_odometer_card";

export async function readHomeOdometerCache(userId: string): Promise<HomeOdometerRow[] | null> {
  if (!userId) return null;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [
      HOME_ODOMETER_CACHE_KEY,
    ]);
    return parseHomeOdometerCache(row?.value, userId);
  } catch {
    return null;
  }
}

export async function writeHomeOdometerCache(userId: string, rows: readonly HomeOdometerRow[]): Promise<void> {
  if (!userId) return;
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      HOME_ODOMETER_CACHE_KEY,
      serialiseHomeOdometerCache(userId, rows),
    ]);
  } catch {
    // best-effort
  }
}

/** Sign out: forget the saved figure. */
export async function clearHomeOdometerCache(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [HOME_ODOMETER_CACHE_KEY]);
  } catch {
    // best-effort
  }
}
