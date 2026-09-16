import { describe, it, expect } from "vitest";
import { needsTimeConfirm, defaultEndFor, clockTime } from "../manualTimeRule";

const at = (iso: string) => new Date(iso);

describe("needsTimeConfirm", () => {
  it("asks on a new manual trip whose time was never touched", () => {
    expect(needsTimeConfirm({ isNew: true, isManual: true, timeTouched: false })).toBe(true);
  });

  it("does not ask once the driver has set a time", () => {
    expect(needsTimeConfirm({ isNew: true, isManual: true, timeTouched: true })).toBe(false);
  });

  it("never asks on an edit or a live trip", () => {
    expect(needsTimeConfirm({ isNew: false, isManual: true, timeTouched: false })).toBe(false);
    expect(needsTimeConfirm({ isNew: true, isManual: false, timeTouched: false })).toBe(false);
  });
});

describe("defaultEndFor", () => {
  const start = at("2026-09-16T08:35:00Z");

  it("ends the drive when the route says it would, rounded up to the minute", () => {
    // 4 min 10 s of routed driving becomes 5 minutes, never 4.
    expect(defaultEndFor(start, 250 / 60).toISOString()).toBe("2026-09-16T08:40:00.000Z");
    expect(defaultEndFor(start, 26).toISOString()).toBe("2026-09-16T09:01:00.000Z");
  });

  it("falls back to one minute after the start without a usable duration", () => {
    expect(defaultEndFor(start, null).toISOString()).toBe("2026-09-16T08:36:00.000Z");
    expect(defaultEndFor(start, 0).toISOString()).toBe("2026-09-16T08:36:00.000Z");
    expect(defaultEndFor(start, Number.NaN).toISOString()).toBe("2026-09-16T08:36:00.000Z");
  });

  it("does not mutate the start it was given", () => {
    const before = start.getTime();
    defaultEndFor(start, 12);
    expect(start.getTime()).toBe(before);
  });
});

describe("clockTime", () => {
  it("formats a local 24-hour clock with zero padding", () => {
    const d = new Date(2026, 8, 16, 8, 5);
    expect(clockTime(d)).toBe("08:05");
    expect(clockTime(new Date(2026, 8, 16, 13, 50))).toBe("13:50");
  });
});
