/**
 * Quiet hours for pushes (21:00-08:00 UK time) and the streak reminder's
 * daytime window. 28 Sep 2026: a shift-only driver got the streak reminder at
 * about 04:18 UK time. UK time must be right on both sides of the clocks
 * changing, since the server runs in UTC.
 */
import { describe, it, expect } from "vitest";
import {
  inStreakReminderWindow,
  isPushQuietHours,
  localHour,
} from "../../services/pushQuietHoursRule.js";

describe("isPushQuietHours in summer (BST, UTC+1)", () => {
  it("the 03:18 UTC tick that paged the driver is quiet (04:18 UK)", () => {
    expect(localHour(new Date("2026-09-28T03:18:00Z"))).toBe(4);
    expect(isPushQuietHours(new Date("2026-09-28T03:18:00Z"))).toBe(true);
  });

  it("goes quiet at 20:00 UTC, which is 21:00 UK", () => {
    expect(isPushQuietHours(new Date("2026-09-28T19:59:59Z"))).toBe(false);
    expect(isPushQuietHours(new Date("2026-09-28T20:00:00Z"))).toBe(true);
  });

  it("opens again at 07:00 UTC, which is 08:00 UK", () => {
    expect(isPushQuietHours(new Date("2026-09-28T06:59:59Z"))).toBe(true);
    expect(isPushQuietHours(new Date("2026-09-28T07:00:00Z"))).toBe(false);
  });
});

describe("isPushQuietHours in winter (GMT, UTC+0)", () => {
  it("goes quiet at 21:00 UTC", () => {
    expect(isPushQuietHours(new Date("2026-01-15T20:59:59Z"))).toBe(false);
    expect(isPushQuietHours(new Date("2026-01-15T21:00:00Z"))).toBe(true);
  });

  it("opens again at 08:00 UTC, so a 07:xx UTC morning briefing tick waits", () => {
    expect(isPushQuietHours(new Date("2026-01-15T07:30:00Z"))).toBe(true);
    expect(isPushQuietHours(new Date("2026-01-15T08:00:00Z"))).toBe(false);
  });

  it("midnight is quiet and reads as hour 0", () => {
    expect(localHour(new Date("2026-01-15T00:00:00Z"))).toBe(0);
    expect(isPushQuietHours(new Date("2026-01-15T00:00:00Z"))).toBe(true);
  });
});

describe("isPushQuietHours on the days the clocks change", () => {
  it("spring forward (29 Mar 2026, 01:00 UTC): 07:30 UTC is 08:30 UK, open", () => {
    expect(isPushQuietHours(new Date("2026-03-29T00:30:00Z"))).toBe(true); // 00:30 GMT
    expect(localHour(new Date("2026-03-29T01:30:00Z"))).toBe(2); // 02:30 BST
    expect(isPushQuietHours(new Date("2026-03-29T06:59:00Z"))).toBe(true); // 07:59 BST
    expect(isPushQuietHours(new Date("2026-03-29T07:30:00Z"))).toBe(false); // 08:30 BST
    expect(isPushQuietHours(new Date("2026-03-29T20:00:00Z"))).toBe(true); // 21:00 BST
  });

  it("fall back (25 Oct 2026, 01:00 UTC): 07:30 UTC is 07:30 UK, still quiet", () => {
    expect(localHour(new Date("2026-10-25T00:30:00Z"))).toBe(1); // 01:30 BST
    expect(localHour(new Date("2026-10-25T01:30:00Z"))).toBe(1); // 01:30 GMT
    expect(isPushQuietHours(new Date("2026-10-25T07:30:00Z"))).toBe(true);
    expect(isPushQuietHours(new Date("2026-10-25T08:00:00Z"))).toBe(false);
    expect(isPushQuietHours(new Date("2026-10-25T20:30:00Z"))).toBe(false); // 20:30 GMT
    expect(isPushQuietHours(new Date("2026-10-25T21:00:00Z"))).toBe(true);
  });
});

describe("inStreakReminderWindow (10:00-11:59 UK)", () => {
  it("summer: 09:00-10:59 UTC", () => {
    expect(inStreakReminderWindow(new Date("2026-09-28T08:59:00Z"))).toBe(false);
    expect(inStreakReminderWindow(new Date("2026-09-28T09:00:00Z"))).toBe(true);
    expect(inStreakReminderWindow(new Date("2026-09-28T10:59:00Z"))).toBe(true);
    expect(inStreakReminderWindow(new Date("2026-09-28T11:00:00Z"))).toBe(false);
  });

  it("winter: 10:00-11:59 UTC", () => {
    expect(inStreakReminderWindow(new Date("2026-01-15T09:59:00Z"))).toBe(false);
    expect(inStreakReminderWindow(new Date("2026-01-15T10:00:00Z"))).toBe(true);
    expect(inStreakReminderWindow(new Date("2026-01-15T11:59:00Z"))).toBe(true);
    expect(inStreakReminderWindow(new Date("2026-01-15T12:00:00Z"))).toBe(false);
  });

  it("never fires at the old 03:18 UTC tick, and never inside quiet hours", () => {
    expect(inStreakReminderWindow(new Date("2026-09-28T03:18:00Z"))).toBe(false);
    for (let h = 0; h < 24; h++) {
      for (const day of ["2026-01-15", "2026-09-28", "2026-03-29", "2026-10-25"]) {
        const t = new Date(`${day}T${String(h).padStart(2, "0")}:30:00Z`);
        if (inStreakReminderWindow(t)) expect(isPushQuietHours(t)).toBe(false);
      }
    }
  });

  it("a 30-minute runner lands in the window at least twice whatever the boot minute", () => {
    for (let bootMinute = 0; bootMinute < 30; bootMinute++) {
      let hits = 0;
      const start = Date.parse("2026-09-28T00:00:00Z") + bootMinute * 60_000;
      for (let t = start; t < start + 24 * 3_600_000; t += 30 * 60_000) {
        if (inStreakReminderWindow(new Date(t))) hits++;
      }
      expect(hits).toBeGreaterThanOrEqual(2);
    }
  });
});
