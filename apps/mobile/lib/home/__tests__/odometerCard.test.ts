import { describe, expect, it } from "vitest";
import {
  MAX_HOME_ODOMETER_ROWS,
  basisOf,
  homeOdometerA11y,
  homeOdometerFigure,
  homeOdometerLine,
  homeVehicleName,
  homeOdometerRows,
  parseHomeOdometerCache,
  selectHomeOdometerVehicles,
  serialiseHomeOdometerCache,
  type HomeOdometerRow,
  type HomeOdometerVehicle,
} from "../odometerCard";

const van = (over: Partial<HomeOdometerVehicle> = {}): HomeOdometerVehicle => ({
  id: "v1",
  make: "Ford",
  model: "Transit",
  isPrimary: false,
  odometer: { miles: 41872, isEstimated: true },
  ...over,
});

// Local noon on Thu 15 Oct 2026.
const NOW = new Date(2026, 9, 15, 12, 0, 0);

describe("selectHomeOdometerVehicles", () => {
  it("is empty (card hidden) when no vehicle has a reading", () => {
    expect(selectHomeOdometerVehicles([])).toEqual([]);
    expect(selectHomeOdometerVehicles(null)).toEqual([]);
    expect(selectHomeOdometerVehicles([van({ odometer: null }), van({ id: "v2", odometer: undefined })])).toEqual([]);
  });

  it("skips figures that are not numbers, so the card never shows NaN", () => {
    const bad = [
      van({ id: "a", odometer: { miles: Number.NaN, isEstimated: true } }),
      van({ id: "b", odometer: { miles: Infinity, isEstimated: false } }),
      van({ id: "c", odometer: { miles: "41872" as unknown as number, isEstimated: false } }),
    ];
    expect(selectHomeOdometerVehicles(bad)).toEqual([]);
  });

  it("puts the primary vehicle first, then list order, at most three", () => {
    const list = [
      van({ id: "a" }),
      van({ id: "b", odometer: null }),
      van({ id: "c" }),
      van({ id: "d", isPrimary: true }),
      van({ id: "e" }),
    ];
    const ids = selectHomeOdometerVehicles(list).map((v) => v.id);
    expect(ids).toEqual(["d", "a", "c"]);
    expect(ids.length).toBe(MAX_HOME_ODOMETER_ROWS);
  });

  it("shows a vehicle with a reading even when the primary has none", () => {
    expect(selectHomeOdometerVehicles([van({ id: "p", isPrimary: true, odometer: null }), van({ id: "x" })]).map((v) => v.id)).toEqual(["x"]);
  });
});

describe("homeVehicleName", () => {
  it("uses make and model, then the plate, then a plain fallback", () => {
    expect(homeVehicleName({ make: "Ford", model: "Transit" })).toBe("Ford Transit");
    expect(homeVehicleName({ make: " ", model: "", registrationPlate: "AB12 CDE" })).toBe("AB12 CDE");
    expect(homeVehicleName({ make: null, model: null })).toBe("Your vehicle");
  });
});

describe("figure and est. mark", () => {
  it("formats whole miles with commas", () => {
    expect(homeOdometerFigure(41872)).toBe("41,872 mi");
    expect(homeOdometerFigure(41871.6)).toBe("41,872 mi");
  });

  it("carries the estimated flag from the list figure, same rule as the vehicle screen", () => {
    const rows = homeOdometerRows([van(), van({ id: "v2", odometer: { miles: 1000, isEstimated: false } })]);
    expect(rows.map((r) => r.isEstimated)).toEqual([true, false]);
    expect(rows[0]).toMatchObject({ vehicleId: "v1", name: "Ford Transit", miles: 41872, basis: null });
  });
});

describe("homeOdometerLine", () => {
  const row = (over: Partial<HomeOdometerRow> = {}): HomeOdometerRow => ({
    vehicleId: "v1",
    name: "Ford Transit",
    miles: 41872,
    isEstimated: true,
    basis: { readAt: new Date(2026, 9, 9, 18, 40).toISOString(), source: "user", tripMilesSince: 72.4 },
    ...over,
  });

  it("names the reading and the trips added since", () => {
    expect(homeOdometerLine(row(), NOW)).toBe("Your reading on Fri 9 Oct, plus 72 mi of trips");
  });

  it("drops the trips part when the figure is a real reading", () => {
    expect(homeOdometerLine(row({ isEstimated: false }), NOW)).toBe("Your reading on Fri 9 Oct");
    expect(homeOdometerLine(row({ basis: { ...row().basis!, tripMilesSince: 0.3 } }), NOW)).toBe("Your reading on Fri 9 Oct");
  });

  it("says today for a reading taken today", () => {
    const basis = { readAt: new Date(2026, 9, 15, 7, 5).toISOString(), source: "user" as const, tripMilesSince: 58 };
    expect(homeOdometerLine(row({ basis }), NOW)).toBe("Your reading today, plus 58 mi of trips");
  });

  it("names fuel log and trip readings", () => {
    expect(homeOdometerLine(row({ basis: { ...row().basis!, source: "fuel" } }), NOW)).toBe(
      "From your fuel log on Fri 9 Oct, plus 72 mi of trips"
    );
    expect(homeOdometerLine(row({ basis: { ...row().basis!, source: "trip", tripMilesSince: 1250 } }), NOW)).toBe(
      "From a trip on Fri 9 Oct, plus 1,250 mi of trips"
    );
  });

  it("is null with no basis or a broken date, and never says NaN", () => {
    expect(homeOdometerLine(row({ basis: null }), NOW)).toBeNull();
    expect(homeOdometerLine(row({ basis: { readAt: "nope", source: "user", tripMilesSince: 5 } }), NOW)).toBeNull();
    const nan = homeOdometerLine(row({ basis: { ...row().basis!, tripMilesSince: Number.NaN } }), NOW);
    expect(nan).toBe("Your reading on Fri 9 Oct");
  });

  it("reads well to a screen reader", () => {
    expect(homeOdometerA11y(row(), NOW)).toBe(
      "Ford Transit odometer, estimated, 41,872 miles. Your reading on Fri 9 Oct, plus 72 mi of trips."
    );
    expect(homeOdometerA11y(row({ isEstimated: false, basis: null }), NOW)).toBe("Ford Transit odometer, recorded, 41,872 miles.");
  });

  it("has no dashes in any copy", () => {
    for (const source of ["user", "fuel", "trip"] as const) {
      expect(homeOdometerLine(row({ basis: { ...row().basis!, source } }), NOW)).not.toMatch(/[—–]/);
    }
  });
});

describe("basisOf and homeOdometerRows", () => {
  it("takes the line's inputs from the /vehicles odometer field", () => {
    expect(basisOf(null)).toBeNull();
    expect(
      basisOf({
        miles: 41872,
        isEstimated: true,
        basis: { readingMiles: 41800, readAt: "2026-10-09T17:40:00.000Z", source: "user" },
        tripMilesSince: 72,
      })
    ).toEqual({ readAt: "2026-10-09T17:40:00.000Z", source: "user", tripMilesSince: 72 });
  });

  it("works against an older server that sends only the figure: no line, no crash", () => {
    expect(basisOf({ miles: 41872, isEstimated: true })).toBeNull();
    const [row] = homeOdometerRows([van()]);
    expect(row.basis).toBeNull();
    expect(homeOdometerLine(row, NOW)).toBeNull();
  });

  it("builds the figure and the line from the same answer, so they always agree", () => {
    const [row] = homeOdometerRows([
      van({
        odometer: {
          miles: 41872,
          isEstimated: true,
          basis: { readingMiles: 41800, readAt: new Date(2026, 9, 9, 18, 40).toISOString(), source: "user" },
          tripMilesSince: 72,
        },
      }),
    ]);
    expect(homeOdometerFigure(row.miles)).toBe("41,872 mi");
    expect(homeOdometerLine(row, NOW)).toBe("Your reading on Fri 9 Oct, plus 72 mi of trips");
  });
});

describe("parseHomeOdometerCache", () => {
  const rows: HomeOdometerRow[] = [
    { vehicleId: "v1", name: "Ford Transit", miles: 41872, isEstimated: true, basis: { readAt: "2026-10-09T17:40:00.000Z", source: "fuel", tripMilesSince: 72 } },
    { vehicleId: "v2", name: "Vauxhall Vivaro", miles: 1000, isEstimated: false, basis: null },
  ];

  it("round-trips rows for the same account", () => {
    expect(parseHomeOdometerCache(serialiseHomeOdometerCache("u1", rows), "u1")).toEqual(rows);
  });

  it("never shows another account's saved figure", () => {
    expect(parseHomeOdometerCache(serialiseHomeOdometerCache("u1", rows), "u2")).toBeNull();
    expect(parseHomeOdometerCache(serialiseHomeOdometerCache("u1", rows), "")).toBeNull();
    // The shape saved before this fix (a bare list) has no owner: ignored.
    expect(parseHomeOdometerCache(JSON.stringify(rows), "u1")).toBeNull();
  });

  it("keeps an empty list (no readings any more) as empty, not unknown", () => {
    expect(parseHomeOdometerCache(serialiseHomeOdometerCache("u1", []), "u1")).toEqual([]);
  });

  it("treats anything unreadable as nothing saved and drops bad rows", () => {
    expect(parseHomeOdometerCache(null, "u1")).toBeNull();
    expect(parseHomeOdometerCache("not json", "u1")).toBeNull();
    expect(parseHomeOdometerCache('{"userId":"u1","rows":{}}', "u1")).toBeNull();
    const mixed = JSON.stringify({
      userId: "u1",
      rows: [
        { vehicleId: "v1", name: "A", miles: "12" },
        { vehicleId: "v2", name: "B", miles: null },
        { vehicleId: "v3", name: "C", miles: 12, isEstimated: "yes", basis: { readAt: "bad" } },
      ],
    });
    expect(parseHomeOdometerCache(mixed, "u1")).toEqual([{ vehicleId: "v3", name: "C", miles: 12, isEstimated: false, basis: null }]);
  });
});
