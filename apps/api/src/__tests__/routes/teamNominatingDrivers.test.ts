/**
 * Nominating drivers who have since joined another company (Oct 2026 review).
 *
 * A driver who nominated a manager keeps an "invited" membership with a
 * userId in that org. If they later become active in another company:
 *  - the emailed-link month must not count them (teamDriverMembershipWhere),
 *  - and the old manager finally accepting must not make them active in two
 *    teams at once (POST /team/invites/accept).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    orgMembership: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("../../services/email.js", () => ({ sendTeamInviteEmail: vi.fn() }));
vi.mock("../../services/teamBilling.js", () => ({ syncSeats: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

import { teamRoutes } from "../../routes/team/index.js";
import { prisma } from "../../lib/prisma.js";
import { notActiveElsewhere, teamDriverMembershipWhere } from "../../services/teamDrivers.js";

const p = prisma as any;
const MANAGER_ID = "00000000-0000-0000-0000-0000000000b1";

beforeEach(() => {
  vi.clearAllMocks();
  p.orgMembership.findUnique.mockResolvedValue({
    id: "m-boss",
    orgId: "org-a",
    role: "admin",
    status: "invited",
    inviteExpiresAt: new Date(Date.now() + 60_000),
    org: { name: "Firm A" },
  });
  p.orgMembership.findFirst.mockResolvedValue(null);
});

describe("teamDriverMembershipWhere", () => {
  it("the portal path is active drivers only, unchanged", () => {
    expect(teamDriverMembershipWhere("org-a")).toEqual({
      orgId: "org-a",
      role: "driver",
      status: "active",
      userId: { not: null },
    });
  });

  it("the email-link path adds invited drivers only when they are not active anywhere else", () => {
    expect(teamDriverMembershipWhere("org-a", true)).toEqual({
      orgId: "org-a",
      role: "driver",
      userId: { not: null },
      OR: [
        { status: "active" },
        { status: "invited", user: { orgMemberships: { none: { status: "active", orgId: { not: "org-a" } } } } },
      ],
    });
  });
});

describe("POST /team/invites/accept by the nominated manager", () => {
  it("activates waiting nominating drivers only if they are not active in another team", async () => {
    const a = await buildApp();
    await a.register(teamRoutes, { prefix: "/team" });
    const res = await a.inject({
      method: "POST",
      url: "/team/invites/accept",
      headers: { authorization: `Bearer ${makeAccessToken(MANAGER_ID)}` },
      payload: { token: "a".repeat(128) },
    });
    expect(res.statusCode).toBe(200);
    expect(p.orgMembership.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = p.orgMembership.updateMany.mock.calls[0][0];
    expect(where).toEqual({ orgId: "org-a", status: "invited", userId: { not: null }, ...notActiveElsewhere("org-a") });
    expect(data).toMatchObject({ status: "active" });
  });
});
