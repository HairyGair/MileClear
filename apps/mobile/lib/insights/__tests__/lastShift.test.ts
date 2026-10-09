import { describe, it, expect } from "vitest";
import { formatDuration, shiftSummary } from "../lastShift";

const fp = (p: number) => `£${(p / 100).toFixed(2)}`;
const shift: any = {
  shiftId: "s", startedAt: "2026-10-07T08:00:00Z", endedAt: "2026-10-07T12:30:00Z", durationSeconds: 16200,
  tripsCompleted: 6, totalMiles: 42.34, businessMiles: 40, deductionPence: 2200, isPersonalBestMiles: false, isPersonalBestTrips: true,
  newAchievements: [],
};

describe("last shift", () => {
  it("formats durations", () => {
    expect(formatDuration(16200)).toBe("4 h 30 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(300)).toBe("5 min");
  });
  it("shows duration, miles and the claim, never a grade", () => {
    const s = shiftSummary(shift)!;
    expect(s.figures(fp).map((f) => f.value)).toEqual(["4 h 30 min", "42.3", "£22.00"]);
    expect(s.spoken(fp)).toContain("mileage claim built");
    expect(s.badge).toBe("Your busiest shift yet.");
  });
  it("shows trips when there is no claim", () => {
    const s = shiftSummary({ ...shift, deductionPence: 0 })!;
    expect(s.figures(fp)[2]).toEqual({ value: "6", label: "trips" });
  });
  it("hides a shift with no driving", () => {
    expect(shiftSummary({ ...shift, tripsCompleted: 0, totalMiles: 0 })).toBeNull();
  });
});
