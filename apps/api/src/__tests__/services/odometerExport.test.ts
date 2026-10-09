/**
 * Odometer columns in the trip exports and the Odometer log CSV (9 Oct 2026).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    vehicle: { findMany: vi.fn(), findFirst: vi.fn() },
    odometerReading: { findMany: vi.fn() },
    fuelLog: { findMany: vi.fn() },
    trip: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma.js";
import { odometerForExportTrips, odometerLogToCsv, taxYearDateRange } from "../../services/odometer.js";
import { tripsToCsv, odometerPdfText } from "../../services/export.js";
import type { ExportTripRow } from "@mileclear/shared";

const V1 = "00000000-0000-0000-0000-0000000000b1";

const row = (over: Partial<ExportTripRow> = {}): ExportTripRow => ({
  date: "09/10/2026",
  startTime: "08:00",
  endTime: "08:40",
  startAddress: "A",
  endAddress: "B",
  distanceMiles: 30.2,
  classification: "business",
  platform: null,
  businessPurpose: null,
  projectLabel: null,
  vehicleType: "car",
  vehicleName: "Ford Focus",
  hmrcRatePence: 55,
  deductionPence: 1661,
  ...over,
});

describe("tripsToCsv odometer columns", () => {
  it("adds Odometer start, end and source after Distance", () => {
    const csv = tripsToCsv([row({ odometerStart: 45100, odometerEnd: 45130, odometerSource: "Estimated" })]);
    const [header, line] = csv.trim().split("\r\n");
    const cols = header.split(",");
    const at = cols.indexOf("Distance (miles)");
    expect(cols.slice(at, at + 5)).toEqual([
      "Distance (miles)", "Odometer start", "Odometer end", "Odometer source", "Classification",
    ]);
    expect(line.split(",").slice(at, at + 4)).toEqual(["30.2", "45100", "45130", "Estimated"]);
  });

  it("leaves the three columns blank when the driver has no readings", () => {
    const csv = tripsToCsv([row()]);
    const [header, line] = csv.trim().split("\r\n");
    const at = header.split(",").indexOf("Odometer start");
    expect(line.split(",").slice(at, at + 3)).toEqual(["", "", ""]);
  });
});

describe("odometerPdfText", () => {
  it("marks estimated figures and leaves recorded ones bare", () => {
    expect(odometerPdfText({ odometerStart: 45210, odometerEnd: 45262, odometerSource: "Estimated" })).toBe("45,210 to 45,262 est.");
    expect(odometerPdfText({ odometerStart: 45210, odometerEnd: 45262, odometerSource: "Recorded" })).toBe("45,210 to 45,262");
    expect(odometerPdfText({})).toBe("—");
  });
});

describe("odometerLogToCsv", () => {
  const day = {
    date: "2026-10-09",
    opening: 45100,
    openingRecorded: true,
    closing: 45138.2,
    closingRecorded: false,
    businessMiles: 30.2,
    personalMiles: 5,
    notSortedMiles: 3,
    tripCount: 3,
    difference: -6,
    openingDifference: 0,
  };

  it("writes whole-mile figures, sources and a numeric negative difference", () => {
    const csv = odometerLogToCsv([day], { make: "Ford", model: "Focus", registrationPlate: "AB12CDE" });
    expect(csv.trim().split("\r\n")[1]).toBe("09/10/2026,Ford Focus,AB12CDE,45100,Recorded,45138,Estimated,30.2,5,3,-6");
  });

  it("leaves figures blank before the first reading", () => {
    const csv = odometerLogToCsv([{ ...day, opening: null, closing: null, difference: 0 }], {
      make: "Ford", model: "Focus", registrationPlate: null,
    });
    expect(csv.trim().split("\r\n")[1]).toBe("09/10/2026,Ford Focus,,,,,,30.2,5,3,0");
  });

  it("neutralises spreadsheet formulas in the vehicle name", () => {
    const csv = odometerLogToCsv([day], { make: "=HYPERLINK(\"x\")", model: "+cmd", registrationPlate: "@AB" });
    const line = csv.trim().split("\r\n")[1];
    expect(line).toContain(`"'=HYPERLINK(""x"") +cmd"`);
    expect(line).toContain(",'@AB,");
      });
});

describe("taxYearDateRange", () => {
  it("gives the London dates of a tax year", () => {
    expect(taxYearDateRange("2026-27")).toEqual({ from: "2026-04-06", to: "2027-04-05" });
    expect(() => taxYearDateRange("2026-28")).toThrow();
  });
});

describe("odometerForExportTrips", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([{ id: V1, isPrimary: true }] as never);
    vi.mocked(prisma.fuelLog.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
  });

  const tripRows = [
    // The business trip is the only one exported, but the personal one between counts for the odometer.
    { id: "a", vehicleId: null, startedAt: new Date("2026-10-09T07:00:00Z"), distanceMiles: 30, classification: "business", odometerStart: null, odometerEnd: null },
    { id: "b", vehicleId: V1, startedAt: new Date("2026-10-09T11:00:00Z"), distanceMiles: 5, classification: "personal", odometerStart: null, odometerEnd: null },
    { id: "c", vehicleId: V1, startedAt: new Date("2026-10-09T14:00:00Z"), distanceMiles: 10, classification: "business", odometerStart: null, odometerEnd: null },
  ];

  it("counts the personal miles in between, and calls only reading-to-reading trips Recorded", async () => {
    vi.mocked(prisma.odometerReading.findMany).mockResolvedValue([
      { id: "r1", vehicleId: V1, readingMiles: 45100, readAt: new Date("2026-10-09T06:30:00Z"), createdAt: new Date("2026-10-09T06:30:00Z") },
      { id: "r2", vehicleId: V1, readingMiles: 45200, readAt: new Date("2026-10-09T13:00:00Z"), createdAt: new Date("2026-10-09T13:00:00Z") },
    ] as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue(tripRows as never);

    const out = await odometerForExportTrips("u1", [
      { id: "a", vehicleId: null },
      { id: "c", vehicleId: V1 },
    ]);
    expect(out.get("a")).toEqual({ start: 45100, end: 45130, source: "Estimated" });
    // 'c' starts right after the 13:00 reading: start is a real reading, end is not.
    expect(out.get("c")).toEqual({ start: 45200, end: 45210, source: "Estimated" });
  });

  it("is empty for a driver with no readings, without loading their trips", async () => {
    vi.mocked(prisma.odometerReading.findMany).mockResolvedValue([] as never);
    const out = await odometerForExportTrips("u1", [{ id: "a", vehicleId: null }]);
    expect(out.size).toBe(0);
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });

  it("leaves out trips from before the first reading", async () => {
    vi.mocked(prisma.odometerReading.findMany).mockResolvedValue([
      { id: "r1", vehicleId: V1, readingMiles: 45100, readAt: new Date("2026-10-09T10:00:00Z"), createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue(tripRows as never);
    const out = await odometerForExportTrips("u1", [{ id: "a", vehicleId: null }]);
    expect(out.has("a")).toBe(false);
  });
});
