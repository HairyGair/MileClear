/**
 * Milesheet trip list (Nov 2026): a manager who pays mileage was told to
 * keep the details of each journey.
 *
 * GET /team/export?format=trips-csv: each approved, still-active driver's
 * business trips for the month. Start and finish times only for drivers told
 * about driving times for THIS org; From and To (street and postcode, never a
 * house number) only for drivers told about places for THIS org. The payroll
 * CSV keeps its shape; the PDF gains a Business trips section.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    orgMembership: { findFirst: vi.fn(), findMany: vi.fn() },
    organisation: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
    teamApproval: { findMany: vi.fn() },
    appEvent: { findMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    trip: { findMany: vi.fn() },
    shift: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("../../services/email.js", () => ({ sendTeamInviteEmail: vi.fn() }));
vi.mock("../../services/teamBilling.js", () => ({ syncSeats: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/postcodeLookup.js", () => ({
  postcodesFor: vi.fn(async (pts: unknown[]) => pts.map((_p, i) => (i % 2 === 0 ? "BN3 1AA" : null))),
}));

import { teamRoutes } from "../../routes/team/index.js";
import { prisma } from "../../lib/prisma.js";
import { placeForManager } from "../../services/teamExport.js";

const ADMIN_ID = "00000000-0000-0000-0000-0000000000a1";
const auth = { authorization: `Bearer ${makeAccessToken(ADMIN_ID)}` };
const p = prisma as any;

async function app() {
  const a = await buildApp();
  await a.register(teamRoutes, { prefix: "/team" });
  return a;
}

const approval = (userId: string, name: string, miles: number) => ({
  userId,
  milesAtApproval: miles,
  amountPenceAtApproval: Math.round(miles * 55),
  approvedAt: new Date("2026-11-01T08:00:00Z"),
  approvedByUserId: null,
  approvedByEmail: "boss@x.com",
  user: { displayName: name, email: `${name.toLowerCase()}@x.com` },
});

beforeEach(() => {
  vi.clearAllMocks();
  p.orgMembership.findFirst.mockResolvedValue({ orgId: "org-1", id: "m-admin" });
  p.organisation.findUniqueOrThrow.mockResolvedValue({ name: "Test Team" });
  p.teamApproval.findMany.mockResolvedValue([
    approval("u-told", "Eve", 22.5),
    approval("u-untold", "Nia", 5),
    approval("u-left", "Lou", 40),
  ]);
  // Lou has left the team: only the approved total stays visible.
  p.orgMembership.findMany.mockImplementation(async (args: any) =>
    args.select?.acceptedAt
      ? [
          { userId: "u-told", acceptedAt: new Date("2026-09-01T09:00:00Z"), user: { displayName: "Eve", email: "eve@x.com" } },
          { userId: "u-untold", acceptedAt: new Date("2026-09-01T09:00:00Z"), user: { displayName: "Nia", email: "nia@x.com" } },
        ]
      : [{ userId: "u-told" }, { userId: "u-untold" }]
  );
  p.appEvent.findMany.mockResolvedValue([
    { userId: "u-told", type: "team.driving_times_notice", metadata: { orgId: "org-1" } },
    { userId: "u-told", type: "team.trip_places_notice", metadata: { orgId: "org-1" } },
    { userId: "u-untold", type: "team.driving_times_notice", metadata: { orgId: "org-2" } },
    { userId: "u-untold", type: "team.trip_places_notice", metadata: { orgId: "org-2" } },
  ]);
  p.trip.findMany.mockImplementation(async (args: any) =>
    args.select?.distanceMiles
      ? [
          {
            userId: "u-told",
            startedAt: new Date("2026-10-14T08:12:00Z"),
            endedAt: new Date("2026-10-14T08:40:00Z"),
            distanceMiles: 12.46,
            projectLabel: "Smith, Hove",
            businessPurpose: "site_visit",
            vehicle: { providedByOthers: false, vehicleType: "van" },
            startAddress: "53, Churchill Road, Hove",
            endAddress: "12 High Street, Brighton, BN1 1AA",
            startLat: 50.8, startLng: -0.1, endLat: 50.82, endLng: -0.14,
          },
          {
            userId: "u-told",
            startedAt: new Date("2026-10-31T23:30:00Z"),
            endedAt: new Date("2026-11-01T00:10:00Z"),
            distanceMiles: 10,
            projectLabel: null,
            businessPurpose: null,
            vehicle: { providedByOthers: true, vehicleType: "van" },
            startAddress: "Flat 3, Kings Road",
            endAddress: null,
            startLat: 50.8, startLng: -0.1, endLat: 50.82, endLng: -0.14,
          },
          {
            userId: "u-untold",
            startedAt: new Date("2026-10-02T09:00:00Z"),
            endedAt: new Date("2026-10-02T09:30:00Z"),
            distanceMiles: 5,
            projectLabel: null,
            businessPurpose: "Supplies",
            vehicle: null,
            startAddress: "1 Secret Lane, Hove",
            endAddress: "2 Other Lane, Hove",
            startLat: 50.8, startLng: -0.1, endLat: 50.82, endLng: -0.14,
          },
        ]
      : []
  );
});

describe("placeForManager", () => {
  it("keeps only the street name and the postcode", () => {
    expect(placeForManager("53, Churchill Road, Chipping Norton, OX7 5HP", null)).toBe("Churchill Road, OX7 5HP");
    expect(placeForManager("12 High Street, Witney", "OX28 6AA")).toBe("High Street, OX28 6AA");
    expect(placeForManager("Flat 3, 7A Kings Road, Hove", null)).toBe("Kings Road");
    expect(placeForManager("Unit 4b, Trading Estate, BN3 1AA", "BN3 9ZZ")).toBe("Trading Estate, BN3 9ZZ");
  });

  it("takes off every kind of house or flat number", () => {
    for (const a of ["1-3 High St", "12/14 High St", "5 & 7 High St", "No. 5 High St", "Flat 2B 10 High St", "53 a High St", "Plot 23 High St"]) {
      expect(placeForManager(a, null)).toBe("High St");
    }
    expect(placeForManager("Apt. 7, Room 4, High Street", null)).toBe("High Street");
  });

  it("never passes on a house name, a saved place's name or typed text", () => {
    expect(placeForManager("The Old Barn, Mill Lane, OX7 5HP", null)).toBe("Mill Lane, OX7 5HP");
    expect(placeForManager("Rose Cottage", "OX7 5HP")).toBe("OX7 5HP");
    expect(placeForManager("Home", "OX7 5HP")).toBe("OX7 5HP");
    expect(placeForManager("Round trip for coffee", null)).toBeNull();
  });

  it("uses one full postcode, the looked-up one first, never a partial one twice", () => {
    expect(placeForManager("Newland, West Oxfordshire, OX2", "OX2 6AA")).toBe("OX2 6AA");
    expect(placeForManager(null, "bn3 1aa")).toBe("BN3 1AA");
    expect(placeForManager("", null)).toBeNull();
  });
});

describe("GET /team/export?format=trips-csv", () => {
  it("lists each business trip, times and places only for drivers told about them", async () => {
    const res = await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=trips-csv", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("-trips.csv");
    const lines = res.body.split("\r\n");
    expect(lines[0]).toBe("Business trips in approved months. From and To give the street name and postcode only.");
    expect(lines[1]).toBe("Driver,Date,Start,Finish,From,To,Miles,Vehicle,Client,Purpose,Note");
    expect(lines).toContain('Eve,14/10/2026,09:12,09:40,"Churchill Road, BN3 1AA","High Street, BN1 1AA",12.5,Van,"Smith, Hove",Site Visit,');
    // 23:30 UTC on 31 Oct is still 31 Oct in London (GMT), ending after midnight.
    expect(lines).toContain('Eve,31/10/2026,23:30,00:10 (next day),"Kings Road, BN3 1AA",,10.0,Van,,,Vehicle paid for by someone else: no mileage due');
    expect(lines).toContain("Eve total,,,,,,22.5,,,,");
    // Nia was told for another team only: no times, no places.
    expect(lines).toContain("Nia,02/10/2026,,,,,5.0,,,Supplies,");
    expect(res.body).not.toContain("Secret Lane");
    expect(lines).toContain("Start and finish times appear once Nia has been told");
    expect(lines).toContain("From and To appear once Nia has been told");
    expect(res.body).not.toContain("Lou");
  });

  it("does not claim a change when many short trips round differently", async () => {
    p.teamApproval.findMany.mockResolvedValue([approval("u-told", "Eve", 1)]);
    p.trip.findMany.mockImplementation(async (args: any) =>
      args.select?.distanceMiles
        ? [0, 1, 2].map((i) => ({
            userId: "u-told",
            startedAt: new Date(`2026-10-1${i}T08:00:00Z`),
            endedAt: new Date(`2026-10-1${i}T08:05:00Z`),
            distanceMiles: 0.34,
            projectLabel: null,
            businessPurpose: null,
            vehicle: null,
          }))
        : []
    );
    const res = await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=trips-csv", headers: auth });
    expect(res.body).toContain("Eve total,,,,,,1.0,,,,\r\n");
  });

  it("notes when the trips no longer add up to the approved miles", async () => {
    p.teamApproval.findMany.mockResolvedValue([approval("u-told", "Eve", 20)]);
    const res = await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=trips-csv", headers: auth });
    expect(res.body).toContain("Eve total,,,,,,22.5,,,,Approved 20.0 mi; trips changed since");
  });

  it("never reads the route or the coordinate trail", async () => {
    await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=trips-csv", headers: auth });
    const tripQuery = p.trip.findMany.mock.calls.find((c: any[]) => c[0]?.select?.distanceMiles)[0];
    for (const key of ["coordinates", "routeGeometry", "routePolyline"]) expect(tripQuery.select[key]).toBeUndefined();
  });

  it("refuses when nothing is approved, like the payroll files", async () => {
    p.teamApproval.findMany.mockResolvedValue([]);
    const res = await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=trips-csv", headers: auth });
    expect(res.statusCode).toBe(400);
  });

  it("keeps the payroll CSV exactly as it was and adds trips to the PDF", async () => {
    const csv = await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=csv", headers: auth });
    expect(csv.body.split("\r\n")[0]).toBe("Driver,Business Miles,Rate (p/mi),Amount,Approved On,Approved By");
    expect(csv.body).not.toContain("Smith");
    const pdf = await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=pdf", headers: auth });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  });
});
