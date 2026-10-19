import { describe, it, expect } from "vitest";
import {
  buildPastShiftTotalsBody,
  emptyTotals,
  homeFrom,
  missingForTotals,
  parseDrops,
  parseTotalMiles,
  pastShiftSavedText,
  totalsOverlapWarning,
  totalsSummary,
  tripsInsideShift,
  withFinish,
  withHome,
  withStart,
  type DraftTotals,
} from "../pastShiftTotalsRule";

const HOME = { lat: 53.8, lng: -1.55, address: "Home" };
const DEPOT = { lat: 53.75, lng: -1.6, address: "Depot" };
const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m, 0, 0);
const NOW = at(23).getTime();

describe("homeFrom", () => {
  it("finds the saved Home", () => {
    expect(
      homeFrom([
        { name: "Gym", latitude: 1, longitude: 1, location_type: "custom" },
        { name: "Home", latitude: 53.8, longitude: -1.55, location_type: "home" },
      ])
    ).toEqual(HOME);
  });

  it("is null without one", () => {
    expect(homeFrom([{ name: "Work", latitude: 1, longitude: 1, location_type: "work" }])).toBeNull();
    expect(homeFrom([])).toBeNull();
  });
});

describe("start and finish", () => {
  it("start at Home and finish at the same place when there is a Home", () => {
    expect(emptyTotals(HOME)).toMatchObject({ from: HOME, to: HOME, toPicked: false });
    expect(emptyTotals(null)).toMatchObject({ from: null, to: null });
  });

  it("Home arriving late fills only what is not set", () => {
    expect(withHome(emptyTotals(null), HOME)).toMatchObject({ from: HOME, to: HOME });
    const picked = withStart(emptyTotals(null), DEPOT);
    expect(withHome(picked, HOME)).toBe(picked);
  });

  it("the finish follows the start until the driver picks one", () => {
    const moved = withStart(emptyTotals(HOME), DEPOT);
    expect(moved).toMatchObject({ from: DEPOT, to: DEPOT });
    const own = withFinish(emptyTotals(HOME), DEPOT);
    expect(withStart(own, null)).toMatchObject({ from: null, to: DEPOT, toPicked: true });
  });
});

describe("parsing what was typed", () => {
  it("reads miles", () => {
    expect(parseTotalMiles("84")).toBe(84);
    expect(parseTotalMiles(" 84.5 ")).toBe(84.5);
    expect(parseTotalMiles("84,5")).toBe(84.5);
    expect(parseTotalMiles("84 miles")).toBe(84);
    expect(parseTotalMiles(".5")).toBe(0.5);
    expect(parseTotalMiles("")).toBeNull();
    expect(parseTotalMiles("about 80")).toBeNull();
    expect(parseTotalMiles("-3")).toBeNull();
  });

  it("reads a comma before three digits as thousands, any other comma as a decimal point", () => {
    expect(parseTotalMiles("1,000")).toBe(1000);
    expect(parseTotalMiles("1,000.5")).toBe(1000.5);
    expect(parseTotalMiles("84,5")).toBe(84.5);
    expect(parseTotalMiles("84,50")).toBe(84.5);
  });

  it("reads drops, which are optional", () => {
    expect(parseDrops("32")).toBe(32);
    expect(parseDrops("")).toBeNull();
    expect(parseDrops("  ")).toBeNull();
    expect(parseDrops("3.5")).toBeNaN();
    expect(parseDrops("lots")).toBeNaN();
  });
});

describe("missingForTotals", () => {
  const filled: DraftTotals = { ...emptyTotals(HOME), milesText: "84" };
  it("asks for one thing at a time", () => {
    expect(missingForTotals({ shiftStart: null, shiftEnd: null, totals: filled })).toBe("Add when the shift started");
    expect(missingForTotals({ shiftStart: at(10), shiftEnd: null, totals: filled })).toBe("Add when the shift ended");
    expect(missingForTotals({ shiftStart: at(10), shiftEnd: at(18), totals: filled, carNeeded: true })).toBe("Pick which car you drove");
    expect(missingForTotals({ shiftStart: at(10), shiftEnd: at(18), totals: { ...filled, milesText: "" } })).toBe("Add the total miles");
    expect(missingForTotals({ shiftStart: at(10), shiftEnd: at(18), totals: { ...filled, from: null } })).toBe("Add where the shift started");
    expect(missingForTotals({ shiftStart: at(10), shiftEnd: at(18), totals: { ...filled, to: null } })).toBe("Add where the shift finished");
    expect(missingForTotals({ shiftStart: at(10), shiftEnd: at(18), totals: filled })).toBeNull();
  });
});

describe("buildPastShiftTotalsBody", () => {
  const build = (totals: Partial<DraftTotals> = {}, extra: Partial<Parameters<typeof buildPastShiftTotalsBody>[0]> = {}) =>
    buildPastShiftTotalsBody({
      shiftStart: at(10),
      shiftEnd: at(18),
      vehicleId: "car-1",
      totals: { ...emptyTotals(HOME), milesText: "84", dropsText: "32", platformTag: "deliveroo", ...totals },
      earningText: "",
      earningPlatform: null,
      now: NOW,
      ...extra,
    });

  it("sends the totals home to home, with the shift's times as given", () => {
    const out = build();
    expect("body" in out).toBe(true);
    if (!("body" in out)) return;
    expect(out.body).toEqual({
      startedAt: at(10).toISOString(),
      endedAt: at(18).toISOString(),
      vehicleId: "car-1",
      totals: {
        startLat: 53.8, startLng: -1.55, endLat: 53.8, endLng: -1.55,
        startAddress: "Home", endAddress: "Home",
        distanceMiles: 84, drops: 32, platformTag: "deliveroo",
      },
    });
    expect(out.plan).toMatchObject({ stretched: false, message: null });
    expect(out.body).not.toHaveProperty("trips");
  });

  it("leaves drops out when none were typed, and rounds miles to the penny's worth", () => {
    const out = build({ dropsText: "", milesText: "84.456" });
    if (!("body" in out)) throw new Error(out.problem);
    expect(out.body.totals).not.toHaveProperty("drops");
    expect(out.body.totals.distanceMiles).toBe(84.46);
  });

  it("refuses what the server would refuse, in the same words", () => {
    expect(build({ milesText: "0" })).toEqual({ problem: "Add the total miles for the shift." });
    expect(build({ milesText: "1200" })).toEqual({ problem: "That's over 1,000 miles for one shift. Check the total miles." });
    expect(build({ milesText: "lots" })).toEqual({ problem: "Check the total miles, for example 84.5." });
    expect(build({ dropsText: "0" })).toEqual({ problem: "The number of drops must be a whole number from 1 to 500." });
    expect(build({ dropsText: "501" })).toEqual({ problem: "The number of drops must be a whole number from 1 to 500." });
    expect(build({ dropsText: "3.5" })).toEqual({ problem: "The number of drops must be a whole number from 1 to 500." });
    expect(build({}, { shiftEnd: at(9) })).toEqual({ problem: "The shift has to end after it starts." });
  });

  it("carries the earning like the trip-by-trip form", () => {
    const out = build({}, { earningText: "98.50", earningPlatform: "deliveroo" });
    if (!("body" in out)) throw new Error(out.problem);
    expect(out.body.earning).toEqual({ platform: "deliveroo", amountPence: 9850 });
    expect(build({}, { earningText: "98.50", earningPlatform: null })).toEqual({ problem: "Pick which app the earnings are from." });
  });
});

describe("words", () => {
  it("sums up the totals before saving", () => {
    expect(totalsSummary({ ...emptyTotals(HOME), milesText: "84.5", dropsText: "32" })).toBe("84.5 mi, 32 drops");
    expect(totalsSummary({ ...emptyTotals(HOME), milesText: "12", dropsText: "1" })).toBe("12 mi, 1 drop");
    expect(totalsSummary({ ...emptyTotals(HOME), milesText: "12", dropsText: "" })).toBe("12 mi");
    expect(totalsSummary({ ...emptyTotals(HOME), milesText: "" })).toBeNull();
  });

  it("confirms the save", () => {
    expect(pastShiftSavedText({ tripCount: 1, miles: 84, fromTotals: true })).toBe("1 shift, 84.0 mi from your totals, saved as Business.");
    expect(pastShiftSavedText({ tripCount: 3, miles: 12.25, fromTotals: false })).toBe("3 trips, 12.3 mi, saved as Business.");
    expect(pastShiftSavedText({ tripCount: 1, miles: 4, fromTotals: false })).toBe("1 trip, 4 mi, saved as Business.");
  });
});

describe("trips already in the shift's hours", () => {
  const iso = (h: number, m = 0) => at(h, m).toISOString();
  it("counts trips whose time sits inside the shift, with their miles", () => {
    const found = tripsInsideShift(
      [
        { startedAt: iso(10, 15), endedAt: iso(10, 40), distanceMiles: 6.2 },
        { startedAt: iso(12), endedAt: null, distanceMiles: 0.5 },
        { startedAt: iso(17, 30), endedAt: iso(17, 55), distanceMiles: 15.7 },
        { startedAt: iso(9, 50), endedAt: iso(10, 10), distanceMiles: 3 }, // starts before
        { startedAt: iso(17, 50), endedAt: iso(18, 20), distanceMiles: 4 }, // ends after
      ],
      at(10),
      at(18)
    );
    expect(found).toEqual({ trips: 3, miles: 22.4 });
  });

  it("warns in plain words, and says nothing with none", () => {
    expect(totalsOverlapWarning({ trips: 3, miles: 22.4 })).toBe(
      "MileClear already has 3 trips (22.4 mi) in these hours. Saving the total as well could count those miles twice."
    );
    expect(totalsOverlapWarning({ trips: 1, miles: 4 })).toBe(
      "MileClear already has 1 trip (4 mi) in these hours. Saving the total as well could count those miles twice."
    );
    expect(totalsOverlapWarning({ trips: 0, miles: 0 })).toBeNull();
  });

  it("points to Trips after saving when there were trips to join", () => {
    expect(pastShiftSavedText({ tripCount: 1, miles: 84, fromTotals: true, overlappingTrips: 3 })).toBe(
      "1 shift, 84.0 mi from your totals, saved as Business. Check Trips to join them into the total."
    );
    expect(pastShiftSavedText({ tripCount: 1, miles: 84, fromTotals: true, overlappingTrips: 0 })).toBe(
      "1 shift, 84.0 mi from your totals, saved as Business."
    );
  });
});
