import { describe, it, expect } from "vitest";
import {
  computeProjectMileageTotals,
  distinctProjectLabels,
  projectLabelKey,
  type ProjectMileageTrip,
} from "./projectMileage.js";
import { calculateMileageDeduction } from "./index.js";

function trip(
  day: string,
  miles: number,
  projectLabel: string | null,
  vehicleType: ProjectMileageTrip["vehicleType"] = "car",
): ProjectMileageTrip {
  return { startedAt: new Date(`${day}T09:00:00Z`), distanceMiles: miles, vehicleType, projectLabel };
}

describe("projectLabelKey", () => {
  it("trims, collapses spaces and ignores case", () => {
    expect(projectLabelKey("  Project   A ")).toBe("project a");
    expect(projectLabelKey("PROJECT A")).toBe("project a");
    expect(projectLabelKey(null)).toBe("");
    expect(projectLabelKey("   ")).toBe("");
  });
});

describe("computeProjectMileageTotals", () => {
  it("groups labels case-insensitively and shows the most-used spelling", () => {
    const res = computeProjectMileageTotals(
      [
        trip("2026-05-01", 10, "Client A"),
        trip("2026-05-02", 10, "client a "),
        trip("2026-05-03", 10, "Client A"),
        trip("2026-05-04", 5, "Client B"),
      ],
      { taxYear: "2026-27" },
    );
    expect(res.projects.map((p) => p.label)).toEqual(["Client A", "Client B"]);
    expect(res.projects[0]).toEqual({ label: "Client A", trips: 3, miles: 30, valuePence: 1650 });
    expect(res.projects[1]).toEqual({ label: "Client B", trips: 1, miles: 5, valuePence: 275 });
    expect(res.totals).toEqual({ trips: 4, miles: 35, valuePence: 1925 });
  });

  it("puts the No project row last even when it is the largest", () => {
    const res = computeProjectMileageTotals(
      [trip("2026-05-01", 100, null), trip("2026-05-02", 4, "Client A"), trip("2026-05-03", 6, "  ")],
      { taxYear: "2026-27" },
    );
    expect(res.projects.map((p) => p.label)).toEqual(["Client A", null]);
    expect(res.projects[1]).toMatchObject({ trips: 2, miles: 106 });
  });

  it("uses the tax year's rates (45p in 2025-26, 55p in 2026-27)", () => {
    const old = computeProjectMileageTotals([trip("2025-05-01", 100, "A")], { taxYear: "2025-26" });
    const now = computeProjectMileageTotals([trip("2026-05-01", 100, "A")], { taxYear: "2026-27" });
    expect(old.totals.valuePence).toBe(4500);
    expect(now.totals.valuePence).toBe(5500);
  });

  it("applies the 10,000-mile threshold in date order and splits the trip that crosses it", () => {
    // Input deliberately out of order: A's 9,990 comes first by date.
    const res = computeProjectMileageTotals(
      [trip("2026-06-01", 100, "B"), trip("2026-05-01", 9_990, "A")],
      { taxYear: "2026-27" },
    );
    const a = res.projects.find((p) => p.label === "A")!;
    const b = res.projects.find((p) => p.label === "B")!;
    expect(a.valuePence).toBe(9_990 * 55);
    // 10 miles at 55p, 90 at 25p.
    expect(b.valuePence).toBe(10 * 55 + 90 * 25);
    expect(res.totals.valuePence).toBe(calculateMileageDeduction("car", 10_090, { taxYear: "2026-27" }).deductionPence);
  });

  it("cars and vans share one threshold; motorbikes are flat and separate", () => {
    const res = computeProjectMileageTotals(
      [
        trip("2026-05-01", 6_000, "A", "car"),
        trip("2026-05-02", 6_000, "B", "van"),
        trip("2026-05-03", 1_000, "C", "motorbike"),
      ],
      { taxYear: "2026-27" },
    );
    const byLabel = Object.fromEntries(res.projects.map((p) => [p.label, p.valuePence]));
    expect(byLabel.A).toBe(6_000 * 55);
    expect(byLabel.B).toBe(4_000 * 55 + 2_000 * 25);
    expect(byLabel.C).toBe(1_000 * 24);
  });

  it("uses the fallback vehicle type for trips with no vehicle", () => {
    const res = computeProjectMileageTotals([trip("2026-05-01", 10, "A", null)], {
      taxYear: "2026-27",
      fallbackVehicleType: "motorbike",
    });
    expect(res.totals.valuePence).toBe(240);
  });

  it("honours an employer rate", () => {
    const res = computeProjectMileageTotals([trip("2026-05-01", 100, "A")], {
      taxYear: "2026-27",
      rates: { customRateFirst10kPence: 30, customRateAfter10kPence: null },
    });
    expect(res.totals.valuePence).toBe(3000);
  });

  it("per-project values always add up to the total, to the penny", () => {
    // Awkward fractional miles that would drift if each trip were rounded on its own.
    const labels = ["A", "B", "c", null];
    const trips: ProjectMileageTrip[] = [];
    for (let i = 0; i < 400; i++) {
      trips.push({
        startedAt: new Date(Date.UTC(2026, 3, 6) + i * 3_600_000),
        distanceMiles: 3.333 + (i % 7) * 11.17 + (i % 3 === 0 ? 47.29 : 0),
        vehicleType: i % 11 === 0 ? "motorbike" : i % 5 === 0 ? "van" : "car",
        projectLabel: labels[i % labels.length],
      });
    }
    const res = computeProjectMileageTotals(trips, { taxYear: "2026-27" });
    const sum = res.projects.reduce((s, p) => s + p.valuePence, 0);
    expect(sum).toBe(res.totals.valuePence);
    expect(res.projects.reduce((s, p) => s + p.trips, 0)).toBe(400);
  });

  it("counts miles in a vehicle someone else pays for at no value, outside the threshold", () => {
    const res = computeProjectMileageTotals(
      [
        { ...trip("2026-05-01", 9_990, "Own"), notClaimed: false },
        { ...trip("2026-05-02", 100, "Client van"), notClaimed: true },
        { ...trip("2026-05-03", 10, "Own"), notClaimed: false },
      ],
      { taxYear: "2026-27" },
    );
    const van = res.projects.find((p) => p.label === "Client van")!;
    expect(van).toEqual({ label: "Client van", trips: 1, miles: 100, valuePence: 0 });
    // The van's 100 miles don't push the own-car trips past 10,000.
    expect(res.totals.valuePence).toBe(10_000 * 55);
    expect(res.totals.miles).toBe(10_100);
  });

  it("ignores zero-mile trips and handles no trips", () => {
    const res = computeProjectMileageTotals([trip("2026-05-01", 0, "A")], { taxYear: "2026-27" });
    expect(res.projects).toEqual([]);
    expect(res.totals).toEqual({ trips: 0, miles: 0, valuePence: 0 });
  });
});

describe("distinctProjectLabels", () => {
  it("returns one spelling per label, most recent first, capped", () => {
    const out = distinctProjectLabels([
      { projectLabel: "Client A", startedAt: "2026-05-01T09:00:00Z" },
      { projectLabel: "client a", startedAt: "2026-05-03T09:00:00Z" },
      { projectLabel: "Client B", startedAt: "2026-05-02T09:00:00Z" },
      { projectLabel: null, startedAt: "2026-05-04T09:00:00Z" },
      { projectLabel: " ", startedAt: "2026-05-05T09:00:00Z" },
    ]);
    expect(out).toEqual(["client a", "Client B"]);
    expect(
      distinctProjectLabels(
        [
          { projectLabel: "X", startedAt: "2026-05-01" },
          { projectLabel: "Y", startedAt: "2026-05-02" },
        ],
        1,
      ),
    ).toEqual(["Y"]);
  });
});
