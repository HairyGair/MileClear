import { getDatabase } from "../db/index";

export interface NotificationPreferences {
  weeklySummary: boolean;
  unclassifiedNudge: boolean;
  shiftReminder: boolean;
  streakReminder: boolean;
  taxDeadline: boolean;
  milestoneAlerts: boolean;
  shiftSummary: boolean;
  monthlyRecap: boolean;
  /**
   * When false, the Live Activity / Dynamic Island indicator is suppressed
   * for auto-detected trips - it only appears when the user explicitly taps
   * Start Trip or Start Shift. Manual-start LA always shows regardless.
   */
  autoTripLiveActivity: boolean;
  /** Daily cheapest-fuel-nearby push (server-sent). Added 8 Jul 2026 —
   *  previously there was NO off switch for these at all. */
  fuelAlert: boolean;
  /** Daily morning briefing push (server-sent). */
  morningBriefing: boolean;
}

const PREFS_KEY = "notification_prefs";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  weeklySummary: true,
  unclassifiedNudge: true,
  shiftReminder: true,
  streakReminder: true,
  taxDeadline: true,
  milestoneAlerts: true,
  shiftSummary: true,
  monthlyRecap: true,
  autoTripLiveActivity: true,
  fuelAlert: true,
  morningBriefing: true,
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
  // Sync to the server so SERVER-sent pushes (fuel alerts, recaps,
  // streaks, briefings) honour these too. Fire-and-forget: a failed
  // sync self-heals on the next toggle.
  syncPreferencesToServer(updated);
}

function syncPreferencesToServer(prefs: NotificationPreferences): void {
  import("../api/index")
    .then(({ apiRequest }) =>
      apiRequest("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      })
    )
    .catch(() => {
      /* offline or transient — next toggle re-syncs */
    });
}
