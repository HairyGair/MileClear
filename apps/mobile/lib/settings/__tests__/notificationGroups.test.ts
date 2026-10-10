import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_GROUPS,
  countNotifications,
  hiddenProCount,
  visibleNotificationGroups,
} from "../notificationGroups";
import type { NotificationPreferences } from "../../notifications/preferences";

// preferences.ts pulls in SQLite, so the real-key check lists them here. Add a
// new switch to NotificationPreferences and this list and the type both fail.
const ALL_KEYS: Record<keyof NotificationPreferences, true> = {
  weeklySummary: true, unclassifiedNudge: true, shiftReminder: true, streakReminder: true,
  taxDeadline: true, milestoneAlerts: true, shiftSummary: true, monthlyRecap: true,
  autoTripLiveActivity: true, fuelAlert: true, morningBriefing: true, cheapestFuelDaily: true,
  evWeeklySummary: true, roadAlerts: true, eveningDigest: true, cazPayReminder: true,
};

describe("notification groups", () => {
  it("groups by reason, in the agreed order", () => {
    expect(NOTIFICATION_GROUPS.map((g) => g.title)).toEqual([
      "About your trips",
      "Tax and money",
      "Your car and fuel",
      "Roads",
      "Your progress",
      "Summaries",
    ]);
  });

  it("lists every switch exactly once, and every key is a real preference", () => {
    const keys = NOTIFICATION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k in ALL_KEYS).toBe(true);
    expect(keys.length).toBe(15);
  });

  it("hides Pro rows from free drivers and says how many", () => {
    expect(visibleNotificationGroups(false).flatMap((g) => g.items).length).toBe(10);
    expect(hiddenProCount(false)).toBe(5);
    expect(hiddenProCount(true)).toBe(0);
    expect(visibleNotificationGroups(true).flatMap((g) => g.items).length).toBe(15);
  });

  it("counts what is on out of what the driver can see", () => {
    const allOn = Object.fromEntries(Object.keys(ALL_KEYS).map((k) => [k, true])) as unknown as NotificationPreferences;
    expect(countNotifications(allOn, true)).toEqual({ on: 15, total: 15 });
    expect(countNotifications(allOn, false)).toEqual({ on: 10, total: 10 });
  });
});
