// Small phone-only values for Insights (chosen period, last milestone seen).
// Stored in tracking_state like the other per-phone settings; every call is
// wrapped so a database hiccup never breaks the screen.

import { getDatabase } from "../db/index";

export async function getInsightsValue(key: string): Promise<string | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [key]
    );
    return row ? row.value : null;
  } catch {
    return null;
  }
}

export async function setInsightsValue(key: string, value: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [key, value]);
  } catch {
    // Non-critical.
  }
}

export async function clearInsightsValue(key: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [key]);
  } catch {
    // Non-critical.
  }
}

export const MILESTONE_SEEN_KEY = "insights_milestone_seen";
export const RECORDS_SEEN_KEY = "insights_records_seen";
export const WEEKLY_GOAL_KEY = "personal_goal_miles";
