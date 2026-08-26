import { describe, it, expect, vi, beforeEach } from "vitest";

// The parser reads existing trips to flag duplicates; stub that out so the
// column-mapping logic can be tested without a database.
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { parseTripCsvPreview, confirmTripCsvImport } from "../../services/tripCsvParser.js";
import { prisma } from "../../lib/prisma.js";

const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("parseTripCsvPreview", () => {
  it("round-trips MileClear's own export columns", async () => {
    const csv = [
      "Date,Start Time,End Time,From,To,Distance (miles),Classification,Platform,Business Purpose",
      "08/08/2026,07:24,07:44,\"14 Rydon Acres, Newton Abbot\",\"Beacon Hill, Torquay\",9.29,business,,Client visit",
    ].join("\n");

    const p = await parseTripCsvPreview(USER, csv);

    expect(p.detectedSource).toBe("MileClear");
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].date).toBe("2026-08-08");
    expect(p.rows[0].distanceMiles).toBe(9.29);
    expect(p.rows[0].classification).toBe("business");
    expect(p.rows[0].from).toBe("14 Rydon Acres, Newton Abbot");
    expect(p.rows[0].startTime).toBe("07:24");
    expect(p.errors).toHaveLength(0);
  });

  it("reads day-first dates, never month-first", async () => {
    // 03/04 must be 3 April. Reading it as 4 March would move the trip into
    // a different tax year without the user ever seeing it happen.
    const csv = "Date,Distance\n03/04/2026,10";
    const p = await parseTripCsvPreview(USER, csv);
    expect(p.rows[0].date).toBe("2026-04-03");
  });

  it("converts kilometres when the header says so", async () => {
    const csv = "Date,Distance (km)\n08/08/2026,100";
    const p = await parseTripCsvPreview(USER, csv);
    expect(p.convertedFromKm).toBe(true);
    expect(p.rows[0].distanceMiles).toBeCloseTo(62.14, 1);
  });

  it("uses values, not just headers, to tell a time column from a place column", async () => {
    // "Start"/"End" are times here...
    const timeCsv = "Date,Start,End,Distance\n08/08/2026,09:15,09:45,4.2";
    const timed = await parseTripCsvPreview(USER, timeCsv);
    expect(timed.rows[0].startTime).toBe("09:15");
    expect(timed.rows[0].from).toBeNull();

    // ...and places here, under identical headers.
    const placeCsv = "Date,Start,End,Distance\n08/08/2026,Exeter,Bristol,75";
    const placed = await parseTripCsvPreview(USER, placeCsv);
    expect(placed.rows[0].from).toBe("Exeter");
    expect(placed.rows[0].startTime).toBeNull();
  });

  it("keeps good rows and reports bad ones by line number", async () => {
    const csv = [
      "Date,Distance",
      "08/08/2026,10",
      "not a date,5",
      "09/08/2026,not a number",
      "10/08/2026,7.5",
    ].join("\n");

    const p = await parseTripCsvPreview(USER, csv);
    expect(p.rows).toHaveLength(2);
    expect(p.totalMiles).toBe(17.5);
    expect(p.errors).toHaveLength(2);
    expect(p.errors[0].line).toBe(3);
    expect(p.errors[1].line).toBe(4);
  });

  it("explains itself when the required columns are absent", async () => {
    await expect(
      parseTripCsvPreview(USER, "Foo,Bar\n1,2")
    ).rejects.toThrow(/date and a distance/);
  });

  it("flags trips already on the account so they are not double counted", async () => {
    (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { startedAt: new Date(2026, 7, 8, 9, 0), distanceMiles: 9.29 },
    ]);
    const csv = "Date,Distance\n08/08/2026,9.29\n08/08/2026,4.10";
    const p = await parseTripCsvPreview(USER, csv);
    expect(p.rows[0].isDuplicate).toBe(true);
    expect(p.rows[1].isDuplicate).toBe(false);
    expect(p.duplicateCount).toBe(1);
  });

  it("neutralises spreadsheet formula injection in free-text cells", async () => {
    const csv = "Date,From,Distance\n08/08/2026,=cmd|'/c calc',5";
    const p = await parseTripCsvPreview(USER, csv);
    expect(p.rows[0].from?.startsWith("'")).toBe(true);
  });
});

describe("confirmTripCsvImport", () => {
  const row = {
    date: "2026-08-08",
    startTime: null,
    endTime: null,
    from: "Newton Abbot",
    to: "Torquay",
    distanceMiles: 9.29,
    classification: "business" as const,
    purpose: null,
    isDuplicate: false,
  };

  it("skips duplicates and imports the rest", async () => {
    const geocode = vi.fn().mockResolvedValue({ lat: 50.5, lng: -3.6 });
    const result = await confirmTripCsvImport(
      USER,
      [row, { ...row, isDuplicate: true }],
      geocode
    );
    expect(result.imported).toBe(1);
    expect(result.skippedDuplicates).toBe(1);
    expect(prisma.trip.create).toHaveBeenCalledTimes(1);
  });

  it("geocodes each distinct address only once", async () => {
    const geocode = vi.fn().mockResolvedValue({ lat: 50.5, lng: -3.6 });
    await confirmTripCsvImport(USER, [row, { ...row, date: "2026-08-09" }], geocode);
    // Two rows, two addresses, four lookups without caching.
    expect(geocode).toHaveBeenCalledTimes(2);
  });

  it("stores 0,0 rather than a wrong location when an address cannot be geocoded", async () => {
    const geocode = vi.fn().mockResolvedValue(null);
    await confirmTripCsvImport(USER, [row], geocode);
    const data = (prisma.trip.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.startLat).toBe(0);
    expect(data.startLng).toBe(0);
    expect(data.isManualEntry).toBe(true);
  });

  it("times an undated trip at midday so it cannot slip a tax year", async () => {
    const geocode = vi.fn().mockResolvedValue(null);
    await confirmTripCsvImport(USER, [{ ...row, date: "2026-04-06" }], geocode);
    const data = (prisma.trip.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.startedAt.getHours()).toBe(12);
    expect(data.startedAt.getDate()).toBe(6);
  });

  it("rolls an after-midnight arrival onto the next day", async () => {
    // A late shift: leaves 23:40, arrives 00:20. The end time is stamped onto
    // the start's date, so without the roll-forward the arrival lands 23h20m
    // BEFORE the departure.
    const geocode = vi.fn().mockResolvedValue(null);
    await confirmTripCsvImport(
      USER,
      [{ ...row, startTime: "23:40", endTime: "00:20" }],
      geocode
    );
    const data = (prisma.trip.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.endedAt.getTime()).toBeGreaterThan(data.startedAt.getTime());
    expect(data.endedAt.getDate()).toBe(9); // start 8 Aug, arrival 9 Aug
    expect((data.endedAt.getTime() - data.startedAt.getTime()) / 60000).toBe(40);
  });

  it("leaves a same-day arrival alone", async () => {
    const geocode = vi.fn().mockResolvedValue(null);
    await confirmTripCsvImport(
      USER,
      [{ ...row, startTime: "09:15", endTime: "09:45" }],
      geocode
    );
    const data = (prisma.trip.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.endedAt.getDate()).toBe(8);
    expect((data.endedAt.getTime() - data.startedAt.getTime()) / 60000).toBe(30);
  });
});
