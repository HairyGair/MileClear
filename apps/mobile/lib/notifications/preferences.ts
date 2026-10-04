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
  /** OPT-IN (2 Oct 2026, off by default): "Cheapest diesel near you today"
   *  each morning, only when it is at least 3p under the local average.
   *  Replaces fuelAlert, which the server no longer sends. */
  cheapestFuelDaily: boolean;
  /** OPT-IN (off by default): Monday EV running-cost summary. */
  evWeeklySummary: boolean;
  /** OPT-IN (off by default, trial): a heads-up before the driver usually
   *  sets off when a road they use often is closed or badly delayed. */
  roadAlerts: boolean;
  /** Pro, Ticket defender: Clean Air Zone "pay by tomorrow" reminder the
   *  evening before a zone's pay-by date (server-sent, on by default). */
  cazPayReminder: boolean;
}

const PREFS_KEY = "notification_prefs";

/** Opt-in switches the server may have turned on for this driver. */
const SERVER_OPT_IN_KEYS = ["cheapestFuelDaily", "evWeeklySummary", "roadAlerts"] as const;

export const DEFAULT_PREFERENCES: NotificationPreferences = {
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
  cheapestFuelDaily: false,
  evWeeklySummary: false,
  roadAlerts: false,
  cazPayReminder: true,
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
  partial: Partial<NotificationPreferences>,
  opts: { awaitServer?: boolean } = {}
): Promise<void> {
  const current = await getNotificationPreferences();
  const updated: Partial<NotificationPreferences> = { ...current, ...partial };
  const db = await getDatabase();
  // An opt-in this phone has never stored is not "off": it may be on at the
  // server (2 Oct 2026 carry-over). Leave it out so the server keeps its value.
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [PREFS_KEY]
    );
    const stored = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    for (const k of SERVER_OPT_IN_KEYS) {
      if (typeof stored[k] !== "boolean" && partial[k] === undefined) delete updated[k];
    }
  } catch {
    for (const k of SERVER_OPT_IN_KEYS) if (partial[k] === undefined) delete updated[k];
  }
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [PREFS_KEY, JSON.stringify(updated)]
  );
  // Sync to the server so SERVER-sent pushes (fuel alerts, recaps,
  // streaks, briefings) honour these too. Fire-and-forget: a failed
  // sync self-heals on the next toggle. awaitServer waits for it, for a
  // screen that reads the server's answer straight after (Road alerts:
  // its reload beat the save and showed "Turn on" again, 3 Oct 2026).
  const sync = syncPreferencesToServer(updated);
  if (opts.awaitServer) await sync;
}

function syncPreferencesToServer(prefs: Partial<NotificationPreferences>): Promise<void> {
  return import("../api/index")
    .then(({ apiRequest }) =>
      apiRequest("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      })
    )
    .then(() => undefined)
    .catch(() => {
      /* offline or transient — next toggle re-syncs */
    });
}


/**
 * Picks up opt-ins set on the server that this phone has never stored: the
 * 2 Oct 2026 carry-over turned the new morning fuel alert on for drivers who
 * were getting the old one. Without this the switch would show off here, and
 * the next save (which sends every switch) would turn it off on the server.
 * Only fills keys this phone has never saved, so a local choice always wins.
 */
export async function adoptServerOptIns(): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences();
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [PREFS_KEY]
    );
    const stored = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    const missing = SERVER_OPT_IN_KEYS.filter((k) => typeof stored[k] !== "boolean");
    if (missing.length === 0) return current;
    const { apiRequest } = await import("../api/index");
    const res = await apiRequest<{ data: Record<string, unknown> }>("/notifications/preferences");
    const adopted: Partial<NotificationPreferences> = {};
    for (const k of missing) {
      const v = res.data?.[k];
      if (typeof v === "boolean") adopted[k] = v;
    }
    if (Object.keys(adopted).length === 0) return current;
    const updated = { ...current, ...adopted };
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
      [PREFS_KEY, JSON.stringify(updated)]
    );
    return updated;
  } catch {
    // Offline or an older API: keep what the phone has.
    return current;
  }
}
