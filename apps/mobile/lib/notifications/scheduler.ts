import * as Notifications from "expo-notifications";
import { getDatabase } from "../db/index";
import { getNotificationPreferences } from "./preferences";

// ─── Android notification channels ───────────────────────────────────────────

export async function setupNotificationChannels(): Promise<void> {
  // Android only — iOS uses system-managed categories
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#f5a623",
    description: "Trip classification nudges, shift alerts, and streak reminders",
  });

  await Notifications.setNotificationChannelAsync("weekly-summary", {
    name: "Weekly Summary",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],
    lightColor: "#f5a623",
    description: "Your Monday mileage recap",
  });

  await Notifications.setNotificationChannelAsync("driving-detection", {
    name: "Driving Detection",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: "#f5a623",
    description: "Alerts when driving is detected outside a shift",
  });
}

// ─── Weekly mileage summary — every Monday 09:00 ─────────────────────────────

export async function scheduleWeeklyMileageSummary(): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.weeklySummary) return;

  // Cancel any existing weekly summary to avoid stacking duplicates
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.identifier.startsWith("weekly-summary")) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  await Notifications.scheduleNotificationAsync({
    identifier: "weekly-summary-monday",
    content: {
      title: "Your weekly mileage recap",
      body: "Tap to see how far you drove this week",
      data: { action: "open_dashboard" },
      ...(require("react-native").Platform.OS === "android" && {
        channelId: "weekly-summary",
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2, // Monday (1 = Sunday, 2 = Monday, ..., 7 = Saturday)
      hour: 9,
      minute: 0,
    },
  });
}

// ─── Tax year deadline reminder — 25 March 10:00 ────────────────────────────
// Fires before the 5 April UK tax year end

export async function scheduleTaxYearDeadlineReminder(): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.taxDeadline) return;

  const now = new Date();
  const year = now.getMonth() < 2 || (now.getMonth() === 2 && now.getDate() < 25)
    ? now.getFullYear()
    : now.getFullYear() + 1;

  const fireDate = new Date(year, 2, 25, 10, 0, 0); // March = index 2

  // Don't schedule if the date is in the past
  if (fireDate <= now) return;

  // Cancel existing tax deadline notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.identifier.startsWith("tax-deadline")) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  await Notifications.scheduleNotificationAsync({
    identifier: `tax-deadline-${year}`,
    content: {
      title: "Tax year ends 5 April",
      body: "11 days to review your mileage and export your records",
      data: { action: "open_trips" },
      ...(require("react-native").Platform.OS === "android" && {
        channelId: "reminders",
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    },
  });
}

// ─── Unclassified trips nudge ─────────────────────────────────────────────────
// Fires immediately if there are trips with no platform/notes older than 24h

const UNCLASSIFIED_COOLDOWN_KEY = "last_unclassified_nudge";
const UNCLASSIFIED_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function checkUnclassifiedTripsNudge(): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.unclassifiedNudge) return;

  const db = await getDatabase();

  // Check cooldown
  const cooldownRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [UNCLASSIFIED_COOLDOWN_KEY]
  );
  if (cooldownRow) {
    const lastFired = parseInt(cooldownRow.value, 10);
    if (Date.now() - lastFired < UNCLASSIFIED_COOLDOWN_MS) return;
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM trips
     WHERE classification = 'business'
       AND notes IS NULL
       AND platform_tag IS NULL
       AND ended_at IS NOT NULL
       AND started_at < ?
     LIMIT 1`,
    [cutoff]
  );

  if (rows.length === 0) return;

  // Count total unreviewed trips for a more informative message
  const countRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM trips
     WHERE classification = 'business'
       AND notes IS NULL
       AND platform_tag IS NULL
       AND ended_at IS NOT NULL
       AND started_at < ?`,
    [cutoff]
  );
  const count = countRow?.count ?? 1;
  const tripWord = count === 1 ? "trip" : "trips";

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Trips need reviewing",
      body: `You have ${count} unreviewed ${tripWord} — add a platform or note to keep your records clean`,
      data: { action: "open_trips" },
      ...(require("react-native").Platform.OS === "android" && {
        channelId: "reminders",
      }),
    },
    trigger: null,
  });

  // Update cooldown
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [UNCLASSIFIED_COOLDOWN_KEY, String(Date.now())]
  );
}

// ─── Long-running shift alert ─────────────────────────────────────────────────
// Fires if an active shift has been running for more than 12 hours

const LONG_SHIFT_COOLDOWN_KEY = "last_long_shift_reminder";
const LONG_SHIFT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const LONG_SHIFT_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function checkLongRunningShift(): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.shiftReminder) return;

  const db = await getDatabase();

  // Get active shift ID from tracking state
  const shiftRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
  );
  if (!shiftRow?.value) return;

  const shiftId = shiftRow.value;

  // Check cooldown
  const cooldownRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [LONG_SHIFT_COOLDOWN_KEY]
  );
  if (cooldownRow) {
    const lastFired = parseInt(cooldownRow.value, 10);
    if (Date.now() - lastFired < LONG_SHIFT_COOLDOWN_MS) return;
  }

  // Look up the shift's started_at from the local shifts table
  const shift = await db.getFirstAsync<{ started_at: string }>(
    "SELECT started_at FROM shifts WHERE id = ?",
    [shiftId]
  );
  if (!shift) return;

  const shiftAgeMs = Date.now() - new Date(shift.started_at).getTime();
  if (shiftAgeMs < LONG_SHIFT_THRESHOLD_MS) return;

  const hoursRunning = Math.floor(shiftAgeMs / (60 * 60 * 1000));

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Shift still running",
      body: `Your shift has been active for ${hoursRunning} hours — did you forget to end it?`,
      data: { action: "open_dashboard" },
      ...(require("react-native").Platform.OS === "android" && {
        channelId: "reminders",
      }),
    },
    trigger: null,
  });

  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [LONG_SHIFT_COOLDOWN_KEY, String(Date.now())]
  );
}

// ─── Streak at risk nudge ─────────────────────────────────────────────────────
// Fires if the driver hasn't recorded a trip in 2–4 days

const STREAK_COOLDOWN_KEY = "last_streak_risk_notif";
const STREAK_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const STREAK_WARN_MIN_DAYS = 2;
const STREAK_WARN_MAX_DAYS = 4;

export async function checkStreakAtRisk(): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.streakReminder) return;

  const db = await getDatabase();

  // Check cooldown
  const cooldownRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [STREAK_COOLDOWN_KEY]
  );
  if (cooldownRow) {
    const lastFired = parseInt(cooldownRow.value, 10);
    if (Date.now() - lastFired < STREAK_COOLDOWN_MS) return;
  }

  // Find most recent completed trip
  const lastTrip = await db.getFirstAsync<{ ended_at: string }>(
    "SELECT ended_at FROM trips WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1"
  );
  if (!lastTrip?.ended_at) return;

  const daysSinceLastTrip =
    (Date.now() - new Date(lastTrip.ended_at).getTime()) / (24 * 60 * 60 * 1000);

  if (
    daysSinceLastTrip < STREAK_WARN_MIN_DAYS ||
    daysSinceLastTrip > STREAK_WARN_MAX_DAYS
  ) {
    return;
  }

  const daysRounded = Math.floor(daysSinceLastTrip);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Keep your streak going",
      body: `It's been ${daysRounded} days since your last trip — jump back in to keep your streak alive`,
      data: { action: "open_dashboard" },
      ...(require("react-native").Platform.OS === "android" && {
        channelId: "reminders",
      }),
    },
    trigger: null,
  });

  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [STREAK_COOLDOWN_KEY, String(Date.now())]
  );
}
