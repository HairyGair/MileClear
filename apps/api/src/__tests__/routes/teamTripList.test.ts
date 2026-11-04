/**
 * Milesheet trip list (Nov 2026): a manager who pays mileage was told to
 * keep the details of each journey.
 *
 * GET /team/export?format=trips-csv: each approved, still-active driver's
 * business trips for the month. Never a place. Start and finish times only
 * for drivers told about driving times for THIS org. The payroll CSV keeps
 * its shape; the PDF gains a Business trips section.
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

import { teamRoutes } from "../../routes/team/index.js";
import { prisma } from "../../lib/prisma.js";

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
    { userId: "u-told", metadata: { orgId: "org-1" } },
    { userId: "u-untold", metadata: { orgId: "org-2" } },
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
            vehicle: { providedByOthers: false },
          },
          {
            userId: "u-told",
            startedAt: new Date("2026-10-31T23:30:00Z"),
            endedAt: new Date("2026-11-01T00:10:00Z"),
            distanceMiles: 10,
            projectLabel: null,
            businessPurpose: null,
            vehicle: { providedByOthers: true },
          },
          {
            userId: "u-untold",
            startedAt: new Date("2026-10-02T09:00:00Z"),
            endedAt: new Date("2026-10-02T09:30:00Z"),
            distanceMiles: 5,
            projectLabel: null,
            businessPurpose: "Supplies",
            vehicle: null,
          },
        ]
      : []
  );
});

describe("GET /team/export?format=trips-csv", () => {
  it("lists each business trip without places, times only for told drivers", async () => {
    const res = await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=trips-csv", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("-trips.csv");
    const lines = res.body.split("\r\n");
    expect(lines[0]).toBe("Business trips in approved months. Journey places are not included.");
    expect(lines[1]).toBe("Driver,Date,Start,Finish,Miles,Client,Purpose,Note");
    expect(lines).toContain('Eve,14/10/2026,09:12,09:40,12.5,"Smith, Hove",Site Visit,');
    // 23:30 UTC on 31 Oct is still 31 Oct in London (GMT), ending after midnight.
    expect(lines).toContain("Eve,31/10/2026,23:30,00:10 (next day),10.0,,,Vehicle paid for by someone else: no mileage due");
    expect(lines).toContain("Eve total,,,,22.5,,,");
    expect(lines).toContain("Nia,02/10/2026,,,5.0,,Supplies,");
    expect(lines).toContain("Start and finish times appear once Nia has been told");
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
    expect(res.body).toContain("Eve total,,,,1.0,,,\r\n");
  });

  it("notes when the trips no longer add up to the approved miles", async () => {
    p.teamApproval.findMany.mockResolvedValue([approval("u-told", "Eve", 20)]);
    const res = await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=trips-csv", headers: auth });
    expect(res.body).toContain("Eve total,,,,22.5,,,Approved 20.0 mi; trips changed since");
  });

  it("never asks the database for places", async () => {
    await (await app()).inject({ method: "GET", url: "/team/export?month=2026-10&format=trips-csv", headers: auth });
    const tripQuery = p.trip.findMany.mock.calls.find((c: any[]) => c[0]?.select?.distanceMiles)[0];
    for (const key of ["startAddress", "endAddress", "startLat", "startLng", "endLat", "endLng", "coordinates"]) {
      expect(tripQuery.select[key]).toBeUndefined();
    }
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
