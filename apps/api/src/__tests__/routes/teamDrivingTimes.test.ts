/**
 * GET /team/month/days: a team admin sees driving times for their own org's
 * drivers only, and only for drivers who have been told.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    orgMembership: { findFirst: vi.fn(), findMany: vi.fn() },
    appEvent: { findMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    trip: { findMany: vi.fn() },
    shift: { findMany: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("../../services/email.js", () => ({ sendTeamInviteEmail: vi.fn() }));

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

beforeEach(() => {
  vi.clearAllMocks();
  p.orgMembership.findFirst.mockResolvedValue({ orgId: "org-1", id: "m-admin" });
  p.orgMembership.findMany.mockResolvedValue([
    { userId: "u-new", acceptedAt: new Date("2026-10-25T09:00:00Z"), user: { displayName: "Nia", email: "nia@x.com" } },
    { userId: "u-emailed", acceptedAt: new Date("2026-09-01T09:00:00Z"), user: { displayName: "Eve", email: "eve@x.com" } },
    { userId: "u-old", acceptedAt: new Date("2026-09-01T09:00:00Z"), user: { displayName: "Olu", email: "olu@x.com" } },
  ]);
  p.appEvent.findMany.mockResolvedValue([
    { userId: "u-emailed", metadata: { orgId: "org-1" } },
    // A notice for a different team does not count for this one.
    { userId: "u-old", metadata: { orgId: "org-2" } },
  ]);
  p.trip.findMany.mockResolvedValue([
    { userId: "u-emailed", startedAt: new Date("2026-10-14T08:12:00Z"), endedAt: new Date("2026-10-14T16:04:00Z") },
  ]);
  p.shift.findMany.mockResolvedValue([]);
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

  it("scopes to the admin's own org and only reads trips for told drivers", async () => {
    const res = await (await app()).inject({
      method: "GET",
      url: "/team/month/days?month=2026-10&orgId=org-2&userId=someone-else",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(p.orgMembership.findMany.mock.calls[0][0].where).toMatchObject({ orgId: "org-1", role: "driver", status: "active" });

    const tripWhere = p.trip.findMany.mock.calls[0][0].where;
    expect(tripWhere).toMatchObject({ classification: "business", isPhantomTrip: false });
    expect(tripWhere.userId.in.sort()).toEqual(["u-emailed", "u-new"]);

    const drivers = res.json().data.drivers;
    const by = Object.fromEntries(drivers.map((d: any) => [d.userId, d]));
    expect(by["u-new"].told).toBe(true);
    expect(by["u-emailed"].told).toBe(true);
    expect(by["u-emailed"].days[0]).toMatchObject({ date: "2026-10-14", startLocal: "09:12", endLocal: "17:04" });
    expect(by["u-old"]).toMatchObject({ told: false, days: [] });
  });
});
