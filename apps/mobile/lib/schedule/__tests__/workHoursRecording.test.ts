import { describe, it, expect } from "vitest";
import { workHoursPauseUntil, endOfLocalDay, WORK_HOURS_LEAD_MS, type WorkHoursSlot } from "../workHoursRecording";

// Ben Turner, 24 Oct 2026: works about two hours over lunch.
const lunch = (day: number, enabled = true): WorkHoursSlot => ({ dayOfWeek: day, startTime: "12:00", endTime: "14:00", enabled });
const WEEKDAYS = [1, 2, 3, 4, 5].map((d) => lunch(d));
// Sat 24 Oct 2026, local time.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();

describe("workHoursPauseUntil", () => {
  it("pauses a weekday morning until half an hour before noon", () => {
    expect(workHoursPauseUntil(WEEKDAYS, at(26, 9, 33))).toBe(at(26, 12) - WORK_HOURS_LEAD_MS);
  });

  it("records inside the hours, the lead and the trail", () => {
    expect(workHoursPauseUntil(WEEKDAYS, at(26, 11, 35))).toBeNull();
    expect(workHoursPauseUntil(WEEKDAYS, at(26, 13))).toBeNull();
    expect(workHoursPauseUntil(WEEKDAYS, at(26, 14, 25))).toBeNull();
  });

  it("pauses after the trail until the next working day", () => {
    expect(workHoursPauseUntil(WEEKDAYS, at(26, 14, 35))).toBe(at(27, 12) - WORK_HOURS_LEAD_MS);
  });

  it("pauses a Saturday until Monday", () => {
    expect(workHoursPauseUntil(WEEKDAYS, at(24, 9, 33))).toBe(at(26, 12) - WORK_HOURS_LEAD_MS);
  });

  it("skips a day that is switched off", () => {
    const slots = [lunch(1, false), lunch(2)];
    expect(workHoursPauseUntil(slots, at(26, 9))).toBe(at(27, 12) - WORK_HOURS_LEAD_MS);
  });

  it("never pauses with no usable hours", () => {
    expect(workHoursPauseUntil([], at(26, 9))).toBeNull();
    expect(workHoursPauseUntil([lunch(1, false)], at(26, 9))).toBeNull();
    expect(workHoursPauseUntil([{ dayOfWeek: 1, startTime: "14:00", endTime: "12:00", enabled: true }], at(26, 9))).toBeNull();
    expect(workHoursPauseUntil([{ dayOfWeek: 1, startTime: "noon", endTime: "14:00", enabled: true }], at(26, 9))).toBeNull();
  });

  it("finds next week's only day", () => {
    expect(workHoursPauseUntil([lunch(1)], at(26, 15))).toBe(at(26 + 7, 12) - WORK_HOURS_LEAD_MS);
  });
});

describe("endOfLocalDay", () => {
  it("is the next midnight", () => {
    expect(endOfLocalDay(at(26, 9, 33))).toBe(at(27, 0));
  });
});
