import { getDatabase } from "../db/index";

export interface NotificationPreferences {
  weeklySummary: boolean;
  unclassifiedNudge: boolean;
  shiftReminder: boolean;
  streakReminder: boolean;
  taxDeadline: boolean;
}

const PREFS_KEY = "notification_prefs";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  weeklySummary: true,
  unclassifiedNudge: true,
  shiftReminder: true,
  streakReminder: true,
  taxDeadline: true,
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [PREFS_KEY]
    );
    if (!row) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(row.value) as Partial<NotificationPreferences>;
    // Merge with defaults so any new keys added later are always present
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function setNotificationPreferences(
  partial: Partial<NotificationPreferences>
): Promise<void> {
  const current = await getNotificationPreferences();
  const updated = { ...current, ...partial };
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [PREFS_KEY, JSON.stringify(updated)]
  );
}
