import { describe, it, expect } from "vitest";
import {
  addLocalDays,
  dayLabel,
  departureFor,
  isFutureDay,
  isFutureDeparture,
  keepWhereIAm,
  localDayKey,
  monthGrid,
  monthTitle,
  missingForSave,
  needsServerCheck,
  phoneHoldsFrom,
  selectedDayChip,
  shouldFillWhereIAm,
  startOfLocalDay,
  PHONE_HOLDS_DAYS,
  WHERE_I_AM_WINDOW_MS,
} from "../pastTripRule";

// Demo values: today is Sun 11 Oct 2026, 10:50 local.
const now = new Date(2026, 9, 11, 10, 50);
const DAY = 24 * 60 * 60 * 1000;

describe("days", () => {
  it("names today, yesterday and older days", () => {
    expect(dayLabel(new Date(2026, 9, 11, 7), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 9, 10, 23, 59), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 9, 3), now)).toBe("Sat 3 Oct");
  });

  it("lights no chip until a day is picked", () => {
    expect(selectedDayChip(null, now)).toBeNull();
    expect(selectedDayChip(new Date(2026, 9, 11), now)).toBe("today");
    expect(selectedDayChip(new Date(2026, 9, 10), now)).toBe("yesterday");
    expect(selectedDayChip(new Date(2026, 9, 3), now)).toBe("picked");
  });

  it("steps calendar days across the clocks going back", () => {
    // 25 Oct 2026 is the last Sunday of October (BST ends).
    const sat = new Date(2026, 9, 24);
    expect(localDayKey(addLocalDays(sat, 1))).toBe("2026-10-25");
    expect(localDayKey(addLocalDays(sat, 2))).toBe("2026-10-26");
    expect(startOfLocalDay(new Date(2026, 9, 25, 23, 30)).getHours()).toBe(0);
  });

  it("builds the departure from the day and the wheel", () => {
    const d = departureFor(new Date(2026, 9, 3), 8, 35);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(35);
    expect(d.getSeconds()).toBe(0);
  });

  it("refuses a set-off time later than now, and future days", () => {
    expect(isFutureDeparture(departureFor(new Date(2026, 9, 11), 11, 0), now)).toBe(true);
    expect(isFutureDeparture(departureFor(new Date(2026, 9, 11), 10, 30), now)).toBe(false);
    expect(isFutureDay(new Date(2026, 9, 12), now)).toBe(true);
    expect(isFutureDay(new Date(2026, 9, 11, 23), now)).toBe(false);
  });
});

describe("where I am", () => {
  const openedAt = now.getTime();

  it("fills only within an hour of a trip ending", () => {
    expect(shouldFillWhereIAm({ lastTripEndedAt: openedAt - 10 * 60 * 1000, openedAt })).toBe(true);
    expect(shouldFillWhereIAm({ lastTripEndedAt: openedAt - WHERE_I_AM_WINDOW_MS, openedAt })).toBe(true);
    expect(shouldFillWhereIAm({ lastTripEndedAt: openedAt - WHERE_I_AM_WINDOW_MS - 1, openedAt })).toBe(false);
  });

  it("never fills with no trips, or a trip that ends in the future", () => {
    expect(shouldFillWhereIAm({ lastTripEndedAt: null, openedAt })).toBe(false);
    expect(shouldFillWhereIAm({ lastTripEndedAt: openedAt + 60_000, openedAt })).toBe(false);
  });

  it("keeps it for today or no day, clears it for an older day", () => {
    expect(keepWhereIAm(null, now)).toBe(true);
    expect(keepWhereIAm(new Date(2026, 9, 11), now)).toBe(true);
    expect(keepWhereIAm(new Date(2026, 9, 10), now)).toBe(false);
  });
});

describe("server check for older days", () => {
  it("holds 90 days when the driver has fewer than 100 trips", () => {
    expect(phoneHoldsFrom({ now: now.getTime(), hundredthNewestStart: null })).toBe(
      now.getTime() - PHONE_HOLDS_DAYS * DAY
    );
  });

  it("holds less when 100 trips go back fewer than 90 days", () => {
    const tenDaysAgo = now.getTime() - 10 * DAY;
    expect(phoneHoldsFrom({ now: now.getTime(), hundredthNewestStart: tenDaysAgo })).toBe(tenDaysAgo);
    const yearAgo = now.getTime() - 365 * DAY;
    expect(phoneHoldsFrom({ now: now.getTime(), hundredthNewestStart: yearAgo })).toBe(
      now.getTime() - PHONE_HOLDS_DAYS * DAY
    );
  });

  it("asks the server only for windows before that", () => {
    const holds = now.getTime() - 10 * DAY;
    expect(needsServerCheck({ windowStart: holds - 1, phoneHoldsFrom: holds })).toBe(true);
    expect(needsServerCheck({ windowStart: holds, phoneHoldsFrom: holds })).toBe(false);
  });
});

describe("the Add button", () => {
  const full = { hasFrom: true, hasTo: true, hasMiles: false, hasDay: true, hasTime: true, timeInFuture: false };

  it("is ready with where and when", () => {
    expect(missingForSave(full)).toBeNull();
    expect(missingForSave({ ...full, hasTo: false, hasMiles: true })).toBeNull();
  });

  it("says what's missing, one thing at a time", () => {
    expect(missingForSave({ ...full, hasFrom: false, hasTo: false, hasDay: false, hasTime: false })).toBe(
      "Add where you went and when"
    );
    expect(missingForSave({ ...full, hasFrom: false })).toBe("Add where you set off from");
    expect(missingForSave({ ...full, hasTo: false })).toBe("Add where you went");
    expect(missingForSave({ ...full, hasDay: false })).toBe("Add which day");
    expect(missingForSave({ ...full, hasTime: false })).toBe("Add when you set off");
    expect(missingForSave({ ...full, timeInFuture: true })).toBe("Set off time is later than now");
  });

  it("keeps the empty-trip guard: no end place and no miles can't save", () => {
    expect(missingForSave({ ...full, hasTo: false, hasMiles: false })).not.toBeNull();
  });
});

describe("monthGrid", () => {
  it("starts October 2026 on a Thursday, Monday first", () => {
    const weeks = monthGrid(2026, 9);
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]?.getDate()).toBe(1);
    expect(weeks[0][6]?.getDate()).toBe(4); // Sun 4 Oct
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const days = weeks.flat().filter((d): d is Date => d !== null);
    expect(days).toHaveLength(31);
    expect(days[30].getDate()).toBe(31);
  });

  it("handles a month that starts on a Monday", () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid(2026, 5)[0][0]?.getDate()).toBe(1);
  });

  it("names the month", () => {
    expect(monthTitle(2026, 9)).toBe("October 2026");
  });
});
