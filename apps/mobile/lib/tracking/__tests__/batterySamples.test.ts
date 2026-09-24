/**
 * Battery over time (24 Sep 2026): the pure parts of batterySamples.ts.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../db/index", () => ({ getDatabase: vi.fn() }));
vi.mock("../batteryAware", () => ({ getBatterySnapshot: vi.fn() }));

import {
  shouldRecordBatterySample,
  compactBatterySeries,
  unpluggedDrainPerHour,
  BATTERY_SAMPLE_GAP_MS,
  type BatterySampleRow,
} from "../batterySamples";

const T0 = Date.parse("2026-09-24T09:00:00Z");
const MIN = 60 * 1000;
const row = (min: number, level: number | null, charging: number | null = 0, ctx = "awake"): BatterySampleRow => ({
  recorded_at: T0 + min * MIN,
  level,
  charging,
  low_power: 0,
  context: ctx,
});

describe("shouldRecordBatterySample", () => {
  it("samples when there has never been one", () => {
    expect(shouldRecordBatterySample(null, T0)).toBe(true);
  });
  it("waits ten minutes between samples", () => {
    expect(shouldRecordBatterySample(T0, T0 + BATTERY_SAMPLE_GAP_MS - 1)).toBe(false);
    expect(shouldRecordBatterySample(T0, T0 + BATTERY_SAMPLE_GAP_MS)).toBe(true);
  });
  it("takes a fresh sample if the clock went backwards", () => {
    expect(shouldRecordBatterySample(T0, T0 - MIN)).toBe(true);
  });
});

describe("compactBatterySeries", () => {
  it("is oldest first, in whole percent, with the context coded", () => {
    const out = compactBatterySeries([row(20, 0.795, 0, "recording"), row(0, 0.8, 1, "foreground")]);
    expect(out).toEqual([
      [Math.round(T0 / 1000), 80, 1, 0, 4],
      [Math.round((T0 + 20 * MIN) / 1000), 80, 0, 0, 1],
    ]);
  });
  it("keeps an unknown level as null, never 0", () => {
    expect(compactBatterySeries([row(0, null)])[0][1]).toBeNull();
  });
});

describe("unpluggedDrainPerHour", () => {
  it("measures percentage points lost per hour while unplugged", () => {
    // 80% -> 74% over an hour in three steps
    expect(unpluggedDrainPerHour([row(0, 0.8), row(20, 0.78), row(40, 0.76), row(60, 0.74)])).toBe(6);
  });
  it("ignores stretches on the charger and any rise in level", () => {
    const rows = [row(0, 0.5, 1), row(20, 0.6, 1), row(40, 0.6), row(70, 0.57), row(100, 0.58)];
    // only 40 -> 70 counts: 3 points in 30 minutes = 6 per hour
    expect(unpluggedDrainPerHour(rows)).toBe(6);
  });
  it("says nothing from under half an hour of unplugged time", () => {
    expect(unpluggedDrainPerHour([row(0, 0.8), row(20, 0.79)])).toBeNull();
  });
  it("does not bridge a gap of more than two hours", () => {
    expect(unpluggedDrainPerHour([row(0, 0.8), row(300, 0.5)])).toBeNull();
  });
});
