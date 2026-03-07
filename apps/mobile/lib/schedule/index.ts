// Work schedule helpers — check if current time is within scheduled work hours
//
// Data lives in SQLite `work_schedule` table (day_of_week 0–6, start_time HH:MM, end_time HH:MM).
// Settings in `tracking_state`: schedule_auto_classify, schedule_auto_mode, schedule_reminder.

import { getDatabase } from "../db/index";

export interface ScheduleSlot {
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  enabled: boolean;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] || "";
}

export function dayNameShort(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek]?.slice(0, 3) || "";
}

// ── CRUD ──────────────────────────────────────────────────────────

export async function getSchedule(): Promise<ScheduleSlot[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    enabled: number;
  }>("SELECT * FROM work_schedule ORDER BY day_of_week ASC");

  return rows.map((r) => ({
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    endTime: r.end_time,
    enabled: r.enabled === 1,
  }));
}

export async function setScheduleSlot(slot: ScheduleSlot): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO work_schedule (day_of_week, start_time, end_time, enabled) VALUES (?, ?, ?, ?)",
    [slot.dayOfWeek, slot.startTime, slot.endTime, slot.enabled ? 1 : 0]
  );
}

export async function removeScheduleSlot(dayOfWeek: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM work_schedule WHERE day_of_week = ?", [
    dayOfWeek,
  ]);
}

export async function clearSchedule(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM work_schedule");
}

// ── Schedule query ────────────────────────────────────────────────

/**
 * Check if a given date/time falls within scheduled work hours.
 * Returns the matching slot if found, or null.
 */
export async function isWithinSchedule(
  date: Date = new Date()
): Promise<ScheduleSlot | null> {
  const db = await getDatabase();
  const dayOfWeek = date.getDay(); // 0=Sunday
  const row = await db.getFirstAsync<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    enabled: number;
  }>(
    "SELECT * FROM work_schedule WHERE day_of_week = ? AND enabled = 1",
    [dayOfWeek]
  );

  if (!row) return null;

  const now = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (now >= row.start_time && now <= row.end_time) {
    return {
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      enabled: true,
    };
  }

  return null;
}

/**
 * Check if any schedule slots are configured (enabled or not).
 */
export async function hasSchedule(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM work_schedule"
  );
  return (row?.count ?? 0) > 0;
}

// ── Settings ──────────────────────────────────────────────────────

export type ScheduleSetting =
  | "schedule_auto_classify"
  | "schedule_auto_mode"
  | "schedule_reminder";

export async function getScheduleSetting(
  key: ScheduleSetting
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [key]
  );
  return row?.value === "1";
}

export async function setScheduleSetting(
  key: ScheduleSetting,
  value: boolean
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [key, value ? "1" : "0"]
  );
}

// ── Classification helper ─────────────────────────────────────────

/**
 * Returns the classification to use for a new trip based on the work schedule.
 * Called from the tracking library when creating GPS-tracked trips.
 */
export async function getScheduleClassification(
  tripDate: Date = new Date()
): Promise<"business" | "unclassified"> {
  const autoClassify = await getScheduleSetting("schedule_auto_classify");
  if (!autoClassify) return "unclassified";

  const slot = await isWithinSchedule(tripDate);
  return slot ? "business" : "unclassified";
}
