/**
 * Milesheet driving times routes.
 *
 * GET /team/month/days: a team admin sees driving times for their own org's
 * drivers only, only for drivers told for THIS org (the
 * team.driving_times_notice event), and only from the day they joined.
 * POST /team/invites/accept records the notice only for a driver accepting
 * from the invite page that showed the consent line.
 * GET /team/export?format=times-csv: the daily times as their own file.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    orgMembership: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    organisation: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
    teamApproval: { findMany: vi.fn().mockResolvedValue([]) },
    appEvent: { findMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    trip: { findMany: vi.fn() },
    shift: { findMany: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("../../services/email.js", () => ({ sendTeamInviteEmail: vi.fn() }));
vi.mock("../../services/teamBilling.js", () => ({ syncSeats: vi.fn().mockResolvedValue(undefined) }));

import { teamRoutes } from "../../routes/team/index.js";
import { prisma } from "../../lib/prisma.js";

const ADMIN_ID = "00000000-0000-0000-0000-0000000000a1";
const DRIVER_ID = "00000000-0000-0000-0000-0000000000d1";
const auth = { authorization: `Bearer ${makeAccessToken(ADMIN_ID)}` };
const driverAuth = { authorization: `Bearer ${makeAccessToken(DRIVER_ID)}` };
const p = prisma as any;

async function app() {
  const a = await buildApp();
  await a.register(teamRoutes, { prefix: "/team" });
  return a;
}

const noticeEvents = () =>
  p.appEvent.create.mock.calls.filter((c: any[]) => c[0]?.data?.type === "team.driving_times_notice");

beforeEach(() => {
  vi.clearAllMocks();
  p.orgMembership.findFirst.mockResolvedValue({ orgId: "org-1", id: "m-admin" });
  p.organisation.findUniqueOrThrow.mockResolvedValue({ name: "Maids Of Glory" });
  p.orgMembership.findMany.mockResolvedValue([
    // Nominated their manager: acceptedAt was set when the manager accepted,
    // but they never saw the consent line.
    { userId: "u-nominator", acceptedAt: new Date("2026-10-25T09:00:00Z"), user: { displayName: "Nia", email: "nia@x.com" } },
    // Moved in by the admin tool today: acceptedAt is now, still not told.
    { userId: "u-moved", acceptedAt: new Date("2026-10-26T09:00:00Z"), user: { displayName: "Mo", email: "mo@x.com" } },
    // Told for this org; joined on 12 Oct.
    { userId: "u-emailed", acceptedAt: new Date("2026-10-12T09:00:00Z"), user: { displayName: "Eve", email: "eve@x.com" } },
    // Told, but for another org only.
    { userId: "u-old", acceptedAt: new Date("2026-09-01T09:00:00Z"), user: { displayName: "Olu", email: "olu@x.com" } },
  ]);
  p.appEvent.findMany.mockResolvedValue([
    { userId: "u-emailed", metadata: { orgId: "org-1" } },
    { userId: "u-old", metadata: { orgId: "org-2" } },
  ]);
  p.trip.findMany.mockResolvedValue([
    { userId: "u-emailed", startedAt: new Date("2026-10-10T08:00:00Z"), endedAt: new Date("2026-10-10T09:00:00Z") },
    { userId: "u-emailed", startedAt: new Date("2026-10-14T08:12:00Z"), endedAt: new Date("2026-10-14T16:04:00Z") },
  ]);
  p.shift.findMany.mockResolvedValue([
    // An evening shift on a day with no business trips is never shown.
    { userId: "u-emailed", startedAt: new Date("2026-10-15T17:00:00Z"), endedAt: new Date("2026-10-15T22:00:00Z") },
  ]);
});

describe("GET /team/month/days", () => {
  it("refuses anyone who is not a team admin", async () => {
    p.orgMembership.findFirst.mockResolvedValue(null);
    const res = await (await app()).inject({ method: "GET", url: "/team/month/days?month=2026-10", headers: auth });
    expect(res.statusCode).toBe(403);
    expect(p.orgMembership.findMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed month", async () => {
    const res = await (await app()).inject({ method: "GET", url: "/team/month/days?month=2026-13", headers: auth });
    expect(res.statusCode).toBe(400);
  });

  it("shows times only for drivers told for this org, from the day they joined", async () => {
    const res = await (await app()).inject({
      method: "GET",
      url: "/team/month/days?month=2026-10&orgId=org-2&userId=someone-else",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(p.orgMembership.findMany.mock.calls[0][0].where).toMatchObject({ orgId: "org-1", role: "driver", status: "active" });

    // Only told drivers' trips are read, with the payroll filter.
    const tripWhere = p.trip.findMany.mock.calls[0][0].where;
    expect(tripWhere).toMatchObject({ classification: "business", isPhantomTrip: false });
    expect(tripWhere.userId.in).toEqual(["u-emailed"]);
    expect(JSON.stringify(tripWhere.AND)).toContain("providedByOthers");

    const by = Object.fromEntries(res.json().data.drivers.map((d: any) => [d.userId, d]));
    expect(by["u-nominator"]).toMatchObject({ told: false, days: [] });
    expect(by["u-moved"]).toMatchObject({ told: false, days: [] });
    expect(by["u-old"]).toMatchObject({ told: false, days: [] });
    expect(by["u-emailed"].told).toBe(true);
    // 10 Oct is before she joined, 15 Oct has only a shift: one day left.
    expect(by["u-emailed"].days).toHaveLength(1);
    expect(by["u-emailed"].days[0]).toMatchObject({ date: "2026-10-14", startLocal: "09:12", endLocal: "17:04", trips: 1 });
  });

  it("tells the nominator once the notice event exists for this org", async () => {
    p.appEvent.findMany.mockResolvedValue([{ userId: "u-nominator", metadata: { orgId: "org-1" } }]);
    p.trip.findMany.mockResolvedValue([
      { userId: "u-nominator", startedAt: new Date("2026-10-26T08:00:00Z"), endedAt: new Date("2026-10-26T09:00:00Z") },
    ]);
    const res = await (await app()).inject({ method: "GET", url: "/team/month/days?month=2026-10", headers: auth });
    const by = Object.fromEntries(res.json().data.drivers.map((d: any) => [d.userId, d]));
    expect(by["u-nominator"].told).toBe(true);
    expect(by["u-nominator"].days.map((d: any) => d.date)).toEqual(["2026-10-26"]);
  });
});

describe("POST /team/invites/accept and the notice", () => {
  const TOKEN = "t".repeat(40);
  beforeEach(() => {
    p.orgMembership.findFirst.mockResolvedValue(null); // not in a team elsewhere
    p.orgMembership.findUnique.mockResolvedValue({
      id: "m-1",
      orgId: "org-1",
      role: "driver",
      status: "invited",
      inviteExpiresAt: null,
      org: { name: "Maids Of Glory" },
    });
  });

  it("records the notice for a driver accepting from the page that showed the line", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: "/team/invites/accept",
      headers: driverAuth,
      payload: { token: TOKEN, drivingTimesNoticeShown: true },
    });
    expect(res.statusCode).toBe(200);
    const ev = noticeEvents();
    expect(ev).toHaveLength(1);
    expect(ev[0][0].data).toMatchObject({ userId: DRIVER_ID, metadata: { orgId: "org-1" } });
  });

  it("records nothing when the accepting surface did not show the line", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: "/team/invites/accept",
      headers: driverAuth,
      payload: { token: TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect(noticeEvents()).toHaveLength(0);
  });

  it("records nothing for nominating drivers activated when their manager accepts", async () => {
    p.orgMembership.findUnique.mockResolvedValue({
      id: "m-admin",
      orgId: "org-1",
      role: "admin",
      status: "invited",
      inviteExpiresAt: null,
      org: { name: "Maids Of Glory" },
    });
    const res = await (await app()).inject({
      method: "POST",
      url: "/team/invites/accept",
      headers: driverAuth,
      payload: { token: TOKEN, drivingTimesNoticeShown: true },
    });
    expect(res.statusCode).toBe(200);
    expect(p.orgMembership.updateMany).toHaveBeenCalled(); // nominators activated
    expect(noticeEvents()).toHaveLength(0);
  });
});

describe("GET /team/export?format=times-csv", () => {
  it("downloads the daily times as their own CSV for every active driver", async () => {
    const res = await (await app()).inject({
      method: "GET",
      url: "/team/export?month=2026-10&format=times-csv",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("-driving-times.csv");
    const lines = res.body.split("\r\n");
    expect(lines[0]).toBe("Driving times: first drive to last drive. Not hours worked.");
    expect(lines).toContain("Eve,14/10/2026,09:12,17:04,7h 52m,1,Trips");
    expect(lines).toContain("Times appear once Nia has been told");
    expect(res.body).not.toContain("Business Miles");
  });
});
