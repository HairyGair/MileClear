/**
 * Ticket defender lookup and PDF: database, postcode and street-name calls
 * are mocked; the shared maths runs for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  trips: [] as unknown[],
  coords: [] as unknown[],
  vehicle: null as unknown,
  prev: null as unknown,
  next: null as unknown,
};
const reverse = vi.fn(async (lat: number, lng: number) => ({
  address: `Durham Road, Gateshead (${lat.toFixed(3)},${lng.toFixed(3)})`,
  outcome: "found" as const,
  cached: true,
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findMany: vi.fn(async () => db.trips),
      findFirst: vi.fn(async (args: { orderBy: { startedAt: string } }) => (args.orderBy.startedAt === "desc" ? db.prev : db.next)),
    },
    tripCoordinate: { findMany: vi.fn(async () => db.coords) },
    vehicle: { findFirst: vi.fn(async () => db.vehicle) },
  },
}));
vi.mock("../../lib/redis.js", () => ({ cacheGet: async () => null, cacheSet: async () => {} }));
vi.mock("../../services/geocoding.js", () => ({ reverseGeocodeDetailed: reverse }));

const { lookupTicketRecord, lookupTicketRecordWithPoints, normalisePostcode, TicketDefenderInputError } = await import(
  "../../services/ticketDefender.js"
);
const { generateTicketDefenderPdf } = await import("../../services/ticketDefenderPdf.js");

const BASE = Date.parse("2026-09-15T13:00:00Z"); // 14:00 UK
const astra = { id: "11111111-1111-4111-8111-111111111111", make: "Vauxhall", model: "Astra", registrationPlate: "AB12 CDE" };

function seedDrive() {
  db.trips = [
    {
      id: "t1",
      startedAt: new Date(BASE),
      endedAt: new Date(BASE + 40 * 60_000),
      startLat: 54.94,
      startLng: -1.6,
      endLat: 55.02,
      endLng: -1.6,
      startAddress: "Home",
      endAddress: "Depot",
      distanceMiles: 5.04,
      isManualEntry: false,
      vehicle: astra,
    },
  ];
  // One point a minute, heading north, 10 m/s, with a 6 minute gap 14:20-14:26.
  db.coords = Array.from({ length: 41 }, (_, i) => i)
    .filter((i) => i <= 20 || i >= 26)
    .map((i) => ({
      tripId: "t1",
      lat: 54.94 + i * 0.002,
      lng: -1.6,
      speed: 10,
      accuracy: 8,
      recordedAt: new Date(BASE + i * 60_000),
    }));
}

beforeEach(() => {
  db.trips = [];
  db.coords = [];
  db.vehicle = null;
  db.prev = null;
  db.next = null;
  reverse.mockClear();
});

describe("normalisePostcode", () => {
  it("formats full postcodes and accepts outcodes", () => {
    expect(normalisePostcode("ne95aa")).toEqual({ code: "NE9 5AA", partial: false });
    expect(normalisePostcode(" sw1a 1aa ")).toEqual({ code: "SW1A 1AA", partial: false });
    expect(normalisePostcode("NE9")).toEqual({ code: "NE9", partial: true });
    expect(normalisePostcode("not a postcode")).toBeNull();
  });
});

describe("lookupTicketRecord", () => {
  it("finds the point nearest the time and the place, with plain-word summary", async () => {
    seedDrive();
    const at = new Date(BASE + 12 * 60_000); // 14:12 UK
    const r = await lookupTicketRecord("u1", { at, lat: 54.97, lng: -1.6, locationLabel: "Durham Road bus gate" });

    expect(r.status).toBe("recorded");
    expect(r.vehicle).toEqual({ id: astra.id, label: "Vauxhall Astra", registration: "AB12 CDE" });
    expect(r.nearestInTime?.offsetSeconds).toBe(0);
    expect(r.nearestInTime?.speedMph).toBe(22);
    expect(r.nearestToLocation?.recordedAt).toBe(new Date(BASE + 15 * 60_000).toISOString());
    expect(r.nearestToLocation?.distanceFromNoticeMetres).toBeLessThan(5);
    expect(r.gaps).toEqual([
      { tripId: "t1", from: new Date(BASE + 20 * 60_000).toISOString(), to: new Date(BASE + 26 * 60_000).toISOString(), minutes: 6 },
    ]);
    expect(r.accuracy).toEqual({ medianMetres: 8, worstMetres: 8 });
    expect(r.summary[0]).toMatch(/^At 14:12 on Tue 15 Sep MileClear recorded your Vauxhall Astra near Durham Road/);
    expect(r.summary[0]).toContain("moving at about 22 mph");
    expect(r.summary.join(" ")).toContain("6-minute gap in recording between 14:20 and 14:26");
    expect(r.caveats.join(" ")).toContain("MileClear only knows where your phone was");
    // Two street-name lookups at most.
    expect(reverse).toHaveBeenCalledTimes(2);
  });

  it("says nothing was recorded, and when the nearest recordings were", async () => {
    db.prev = { startedAt: new Date(BASE - 5 * 3600_000), endedAt: new Date(BASE - 4 * 3600_000) };
    db.next = { startedAt: new Date(BASE + 3 * 3600_000) };
    const r = await lookupTicketRecord("u1", { at: new Date(BASE) });
    expect(r.status).toBe("nothing_recorded");
    expect(r.before).toBe(new Date(BASE - 4 * 3600_000).toISOString());
    expect(r.summary[0]).toContain("no recorded journey within an hour either side of 14:00");
    expect(reverse).not.toHaveBeenCalled();
  });

  it("lists a hand-entered trip without mapping it", async () => {
    db.trips = [{ ...((seedDrive(), db.trips[0]) as object), isManualEntry: true }];
    db.coords = [];
    const r = await lookupTicketRecord("u1", { at: new Date(BASE + 10 * 60_000) });
    expect(r.status).toBe("manual_only");
    expect(r.caveats[0]).toContain("entered by hand");
  });

  it("falls back to start and end when a tracked trip has no points", async () => {
    seedDrive();
    db.coords = [];
    const r = await lookupTicketRecord("u1", { at: new Date(BASE + 5 * 60_000) });
    expect(r.status).toBe("recorded");
    expect(r.nearestInTime?.recordedAt).toBe(new Date(BASE).toISOString());
    expect(r.caveats[0]).toContain("only the start and end");
  });

  it("rejects a time in the future and an unknown vehicle", async () => {
    await expect(lookupTicketRecord("u1", { at: new Date(Date.now() + 3600_000) })).rejects.toBeInstanceOf(TicketDefenderInputError);
    await expect(
      lookupTicketRecord("u1", { at: new Date(BASE), vehicleId: "22222222-2222-4222-8222-222222222222" })
    ).rejects.toBeInstanceOf(TicketDefenderInputError);
  });
});

describe("generateTicketDefenderPdf", () => {
  it("renders a PDF with the track, table and statement", async () => {
    seedDrive();
    const { lookup, points } = await lookupTicketRecordWithPoints("u1", {
      at: new Date(BASE + 12 * 60_000),
      lat: 54.97,
      lng: -1.6,
      locationLabel: "Durham Road bus gate",
    });
    const pdf = await generateTicketDefenderPdf({
      lookup,
      points,
      userId: "u1",
      driverName: "Sam Driver",
      notice: { type: "bus_lane", reference: "GH12345678", issuer: "Gateshead Council" },
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  });

  it("renders when nothing was recorded", async () => {
    const { lookup, points } = await lookupTicketRecordWithPoints("u1", { at: new Date(BASE) });
    const pdf = await generateTicketDefenderPdf({ lookup, points, userId: "u1", driverName: "Account holder", notice: {} });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
