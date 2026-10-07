/**
 * Phone details attached to an in-app problem report (6 Oct 2026).
 */
import { describe, it, expect } from "vitest";
import { shapeDeviceContext, type DumpLike } from "../../services/supportContext.js";

const dump: DumpLike = {
  capturedAt: new Date("2026-10-06T07:53:00Z"),
  platform: "ios",
  osVersion: "26.6.2",
  appVersion: "1.3.12",
  buildNumber: "93",
  verdict: "warning",
  statusJson: {
    updates: { createdAt: "2026-10-03T08:02:00Z", runtimeVersion: "1.3.12-build93" },
    backgroundPermission: "granted",
    motionPermission: "denied",
    enabled: true,
    activeShiftId: "__quick_trip__",
    device: { lowPowerMode: true, modelName: "iPhone 13 mini", screenWidth: 375, screenHeight: 812, fontScale: 1.24 },
  },
};

describe("shapeDeviceContext", () => {
  it("lifts the fields the admin needs from the dump", () => {
    const c = shapeDeviceContext(dump, true, []);
    expect(c).toMatchObject({
      capturedAt: "2026-10-06T07:53:00.000Z",
      platform: "ios",
      appVersion: "1.3.12",
      buildNumber: "93",
      verdict: "warning",
      updateCreatedAt: "2026-10-03T08:02:00Z",
      runtimeVersion: "1.3.12-build93",
      backgroundPermission: "granted",
      motionPermission: "denied",
      autoDetectEnabled: true,
      lowPowerMode: true,
      modelName: "iPhone 13 mini",
      screenWidth: 375,
      screenHeight: 812,
      fontScale: 1.24,
      activeShiftId: "__quick_trip__",
      isPro: true,
    });
  });

  it("copes with no dump and odd status shapes", () => {
    expect(shapeDeviceContext(null, null, [])).toEqual({ isPro: null, recentTrips: [] });
    const c = shapeDeviceContext({ ...dump, statusJson: { activeShiftId: "null", enabled: "yes", updates: "x" } }, false, []);
    expect(c.activeShiftId).toBeNull();
    expect(c.autoDetectEnabled).toBeNull();
    expect(c.updateCreatedAt).toBeNull();
  });

  it("summarises the last five trips by source", () => {
    const t = (n: number, o: Partial<{ isManualEntry: boolean; shiftId: string | null }> = {}) => ({
      startedAt: new Date(Date.UTC(2026, 9, n)),
      distanceMiles: 12.3456,
      isManualEntry: false,
      shiftId: null,
      coordinateCount: 40,
      ...o,
    });
    const c = shapeDeviceContext(null, false, [t(6), t(5, { shiftId: "s" }), t(4, { isManualEntry: true }), t(3), t(2), t(1)]);
    expect(c.recentTrips).toHaveLength(5);
    expect(c.recentTrips!.map((r) => r.source)).toEqual(["auto", "shift", "manual", "auto", "auto"]);
    expect(c.recentTrips![0]).toEqual({ startedAt: "2026-10-06T00:00:00.000Z", distanceMiles: 12.35, source: "auto", points: 40 });
  });
});
