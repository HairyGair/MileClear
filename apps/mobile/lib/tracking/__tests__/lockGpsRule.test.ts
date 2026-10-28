import { describe, expect, it } from "vitest";
import {
  LOCK_GPS_WARNING_GAP_MS,
  gpsStartErrorText,
  lockGpsWarningCopy,
  lockKindOf,
  warningDue,
} from "../lockGpsRule";

const QUICK = "__quick_trip__";
const ARRIVED = "__arrived_pending__";

describe("lockKindOf", () => {
  it("a shift id is a shift, the quick-trip id a Start Trip", () => {
    expect(lockKindOf("3f2a-shift", QUICK, ARRIVED)).toBe("shift");
    expect(lockKindOf(QUICK, QUICK, ARRIVED)).toBe("quick_trip");
  });
  it("no lock, or the Arrived-pending marker, needs no GPS", () => {
    expect(lockKindOf(null, QUICK, ARRIVED)).toBeNull();
    expect(lockKindOf(undefined, QUICK, ARRIVED)).toBeNull();
    expect(lockKindOf("", QUICK, ARRIVED)).toBeNull();
    expect(lockKindOf(ARRIVED, QUICK, ARRIVED)).toBeNull();
  });
});

describe("gpsStartErrorText", () => {
  it("names Android's off-screen refusal", () => {
    const err = new Error(
      "Couldn't start the foreground service. Foreground service cannot be started when the application is in the background"
    );
    expect(gpsStartErrorText(err)).toBe("not_on_screen");
  });
  it("names a missing manifest permission", () => {
    expect(
      gpsStartErrorText(new Error("Couldn't start the foreground service. Foreground service permissions were not found in the manifest"))
    ).toBe("manifest_permission");
  });
  it("falls back to the code, then a short message, then unknown", () => {
    expect(gpsStartErrorText({ code: "ERR_TASK_MANAGER" })).toBe("ERR_TASK_MANAGER");
    expect(gpsStartErrorText(new Error("x".repeat(300)))).toHaveLength(120);
    expect(gpsStartErrorText(null)).toBe("unknown");
  });
});

describe("warningDue", () => {
  const now = 1_800_000_000_000;
  it("first warning, or an unreadable stamp, is due", () => {
    expect(warningDue(null, now)).toBe(true);
    expect(warningDue(NaN, now)).toBe(true);
  });
  it("waits the gap between warnings", () => {
    expect(warningDue(now - LOCK_GPS_WARNING_GAP_MS + 1000, now)).toBe(false);
    expect(warningDue(now - LOCK_GPS_WARNING_GAP_MS, now)).toBe(true);
  });
});

describe("lockGpsWarningCopy", () => {
  it("says what isn't recording and what to do", () => {
    expect(lockGpsWarningCopy("shift").title).toBe("Your shift isn't recording");
    expect(lockGpsWarningCopy("quick_trip").body).toMatch(/Open MileClear/);
  });
});
