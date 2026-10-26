/**
 * Milesheet: approve the month from an email link (Oct 2026).
 *
 * /team/approval-links/:token is public. The token grants one org for one
 * month: the page never shows driver emails, the month always comes from the
 * link, a driver id from another org goes nowhere, approvals are written the
 * same way as the portal's (snapshot, unfinished-month refusal, note on a
 * query) with approvedByUserId null and approvedByEmail set.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    teamApprovalLink: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    orgMembership: { findFirst: vi.fn(), count: vi.fn(), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    teamApproval: { upsert: vi.fn() },
    appEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("../../lib/push.js", () => ({ sendPushToUser: vi.fn().mockResolvedValue(null) }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/email.js", () => ({ sendTeamInviteEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/teamExport.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../services/teamExport.js")>();
  return { ...real, computeTeamMonthSummary: vi.fn() };
});

import { teamApprovalLinkRoutes } from "../../routes/team/approvalLink.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { sendPushToUser } from "../../lib/push.js";
import { sendTeamInviteEmail } from "../../services/email.js";
import { computeTeamMonthSummary } from "../../services/teamExport.js";
import { hashLinkToken } from "../../services/teamApprovalLinks.js";

const p = prisma as any;
const TOKEN = "cd".repeat(64);
const url = (rest = "") => `/team/approval-links/${TOKEN}${rest}`;

let linkMonth = "2026-10";
let recipientStatus: "active" | "invited" = "invited";
let activeAdmins = 0;

const summary = {
  orgId: "org-1",
  orgName: "Firm Ltd",
  month: "2026-10",
  drivers: [
    {
      membershipId: "m-nia",
      userId: "u-nia",
      displayName: "Nia",
      email: "nia@private.example",
      businessTrips: 12,
      businessMiles: 140.5,
      amountPence: 7728,
      ratePence: 55,
      usesOwnRate: false,
      status: "pending",
      note: null,
      approvedAt: null,
      approvedByName: "someone@else.example",
      driftMiles: null,
      unclassifiedTrips: 2,
    },
    {
      membershipId: "m-anon",
      userId: "u-anon",
      displayName: null,
      email: "anon@private.example",
      businessTrips: 0,
      businessMiles: 0,
      amountPence: 0,
      ratePence: 55,
      usesOwnRate: false,
      status: "pending",
      note: null,
      approvedAt: null,
      approvedByName: null,
      driftMiles: null,
      unclassifiedTrips: 0,
    },
  ],
  totalMiles: 140.5,
  totalAmountPence: 7728,
  approvedCount: 0,
  pendingCount: 2,
  queriedCount: 0,
};

// Memberships in the world: two drivers in org-1, one in org-2.
const drivers = [
  { id: "m-nia", orgId: "org-1", userId: "u-nia", role: "driver", status: "invited" },
  { id: "m-anon", orgId: "org-1", userId: "u-anon", role: "driver", status: "active" },
  { id: "m-other", orgId: "org-2", userId: "u-other", role: "driver", status: "active" },
];

// Users active in another company (the notActiveElsewhere filter).
let activeElsewhere = new Set<string>();

function statusOk(where: any, status: string, userId?: string | null) {
  if (where.OR) {
    return where.OR.some((b: any) => statusOk(b, status) && (!b.user || !(userId && activeElsewhere.has(userId))));
  }
  if (!where.status) return true;
  if (typeof where.status === "string") return where.status === status;
  return where.status.in.includes(status);
}

async function app() {
  const a = await buildApp();
  await a.register(teamApprovalLinkRoutes, { prefix: "/team" });
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T09:00:00Z"));
  linkMonth = "2026-10";
  recipientStatus = "invited";
  activeAdmins = 0;
  activeElsewhere = new Set();
  p.user.findUnique.mockResolvedValue(null);
  p.orgMembership.updateMany.mockImplementation(async () => {
    // Switching the invited manager off: the link stops working with it.
    recipientStatus = "disabled" as any;
    return { count: 1 };
  });

  p.teamApprovalLink.findUnique.mockImplementation(async ({ where }: any) =>
    where.tokenHash === hashLinkToken(TOKEN)
      ? {
          id: "link-1",
          orgId: "org-1",
          month: linkMonth,
          recipientEmail: "boss@firm.co.uk",
          tokenHash: hashLinkToken(TOKEN),
          expiresAt: new Date("2026-11-30T00:00:00Z"),
          org: { name: "Firm Ltd" },
        }
      : null
  );
  p.orgMembership.count.mockImplementation(async () => activeAdmins);
  p.orgMembership.findFirst.mockImplementation(async ({ where }: any) => {
    if (where.role === "admin") {
      // (Its OR is the email match, not a status rule.)
      return where.orgId === "org-1" && statusOk({ status: where.status }, recipientStatus)
        ? { id: "m-boss", status: recipientStatus }
        : null;
    }
    const m = drivers.find(
      (d) =>
        d.orgId === where.orgId &&
        (where.id === undefined || d.id === where.id) &&
        (where.userId === undefined || typeof where.userId === "object" || d.userId === where.userId) &&
        statusOk(where, d.status, d.userId)
    );
    return m ? { id: m.id, userId: m.userId } : null;
  });
  p.teamApproval.upsert.mockImplementation(async ({ create }: any) => ({ id: "appr-1", status: create.status }));
  (computeTeamMonthSummary as any).mockResolvedValue(summary);
});

afterEach(() => vi.useRealTimers());

describe("GET /team/approval-links/:token", () => {
  it("shows the month without any driver email or user id", async () => {
    const res = await (await app()).inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toMatchObject({
      orgName: "Firm Ltd",
      month: "2026-10",
      monthLabel: "October 2026",
      monthFinished: true,
      hasAccount: false,
      askPrice: true,
      totalMiles: 140.5,
    });
    expect(body.drivers[0]).toMatchObject({ id: "m-nia", name: "Nia", businessMiles: 140.5, amountPence: 7728, businessTrips: 12 });
    expect(body.drivers[1].name).toBe("Unnamed driver");
    const raw = res.body;
    expect(raw).not.toContain("@private.example");
    expect(raw).not.toContain("someone@else.example");
    expect(raw).not.toContain("u-nia");
    expect(raw).not.toContain(TOKEN);
    // No active admin: the nominating driver is counted.
    expect(computeTeamMonthSummary).toHaveBeenCalledWith("org-1", "2026-10", { includeNominatingDrivers: true });
  });

  it("uses the portal's list when the org has an active admin", async () => {
    recipientStatus = "active";
    activeAdmins = 1;
    const res = await (await app()).inject({ method: "GET", url: url() });
    expect(res.json().data.hasAccount).toBe(true);
    expect(computeTeamMonthSummary).toHaveBeenCalledWith("org-1", "2026-10", {});
  });

  it("an unknown or malformed token is the plain expired answer", async () => {
    for (const bad of ["ef".repeat(64), "short"]) {
      const res = await (await app()).inject({ method: "GET", url: `/team/approval-links/${bad}` });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "This link has expired.", code: "LINK_EXPIRED" });
    }
    expect(computeTeamMonthSummary).not.toHaveBeenCalled();
  });

  it("an expired link shows nothing", async () => {
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    const res = await (await app()).inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(404);
    expect(computeTeamMonthSummary).not.toHaveBeenCalled();
  });

  it("dies when the recipient stops being a manager there", async () => {
    recipientStatus = "invited";
    p.orgMembership.findFirst.mockImplementationOnce(async () => null);
    const res = await (await app()).inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /team/approval-links/:token/approvals", () => {
  it("approves with the same snapshot as the portal, approver email and no user", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: url("/approvals"),
      payload: { driverId: "m-nia", status: "approved" },
    });
    expect(res.statusCode).toBe(201);
    const call = p.teamApproval.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ orgId_userId_month: { orgId: "org-1", userId: "u-nia", month: "2026-10" } });
    expect(call.create).toMatchObject({
      status: "approved",
      milesAtApproval: 140.5,
      amountPenceAtApproval: 7728,
      approvedByUserId: null,
      approvedByEmail: "boss@firm.co.uk",
    });
    expect(call.create.approvedAt).toBeInstanceOf(Date);
    expect(logEvent).toHaveBeenCalledWith("team.month_approved", null, {
      orgId: "org-1",
      driverUserId: "u-nia",
      month: "2026-10",
      note: null,
      via: "email_link",
    });
    // The event never carries the approver's address.
    expect(JSON.stringify((logEvent as any).mock.calls)).not.toContain("boss@firm.co.uk");
  });

  it("a query needs a note, and sends the driver the note", async () => {
    const a = await app();
    const noNote = await a.inject({ method: "POST", url: url("/approvals"), payload: { driverId: "m-nia", status: "queried" } });
    expect(noNote.statusCode).toBe(400);
    expect(p.teamApproval.upsert).not.toHaveBeenCalled();

    const res = await a.inject({
      method: "POST",
      url: url("/approvals"),
      payload: { driverId: "m-nia", status: "queried", note: "Is the 14th personal?" },
    });
    expect(res.statusCode).toBe(201);
    expect(p.teamApproval.upsert.mock.calls[0][0].create).toMatchObject({
      status: "queried",
      note: "Is the 14th personal?",
      approvedByUserId: null,
      approvedAt: null,
      milesAtApproval: null,
    });
    expect(logEvent).toHaveBeenCalledWith("team.month_queried", null, expect.objectContaining({ via: "email_link" }));
    expect(sendPushToUser).toHaveBeenCalledWith(
      "u-nia",
      expect.any(String),
      "Is the 14th personal?",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("refuses to approve a month that has not finished", async () => {
    linkMonth = "2026-11";
    const res = await (await app()).inject({ method: "POST", url: url("/approvals"), payload: { driverId: "m-nia", status: "approved" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("hasn't finished yet");
    expect(p.teamApproval.upsert).not.toHaveBeenCalled();
  });

  it("a driver from another org is not found, and nothing is written", async () => {
    const res = await (await app()).inject({ method: "POST", url: url("/approvals"), payload: { driverId: "m-other", status: "approved" } });
    expect(res.statusCode).toBe(404);
    expect(p.teamApproval.upsert).not.toHaveBeenCalled();
    // Every lookup was scoped to the link's org.
    for (const [arg] of p.orgMembership.findFirst.mock.calls) expect(arg.where.orgId).toBe("org-1");
  });

  it("the month and org always come from the link, never the request", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: url("/approvals"),
      payload: { driverId: "m-nia", status: "approved", month: "2026-01", orgId: "org-2" },
    });
    expect(res.statusCode).toBe(201);
    expect(p.teamApproval.upsert.mock.calls[0][0].create).toMatchObject({ orgId: "org-1", month: "2026-10" });
  });

  it("an invited nominating driver cannot be approved once the org has an active admin", async () => {
    recipientStatus = "active";
    activeAdmins = 1;
    const res = await (await app()).inject({ method: "POST", url: url("/approvals"), payload: { driverId: "m-nia", status: "approved" } });
    expect(res.statusCode).toBe(404);
  });

  it("a dead link writes nothing", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: `/team/approval-links/${"ef".repeat(64)}/approvals`,
      payload: { driverId: "m-nia", status: "approved" },
    });
    expect(res.statusCode).toBe(404);
    expect(p.teamApproval.upsert).not.toHaveBeenCalled();
  });

  it("a signed-in session is not needed and not used", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: url("/approvals"),
      headers: { authorization: `Bearer ${makeAccessToken("u-someone")}` },
      payload: { driverId: "m-nia", status: "approved" },
    });
    expect(res.statusCode).toBe(201);
    expect(p.teamApproval.upsert.mock.calls[0][0].create.approvedByUserId).toBeNull();
  });
});

describe("POST /team/approval-links/:token/invite", () => {
  it("mints a fresh manager invite for the address the link went to", async () => {
    const res = await (await app()).inject({ method: "POST", url: url("/invite") });
    expect(res.statusCode).toBe(200);
    const update = p.orgMembership.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "m-boss" });
    expect(update.data.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sendTeamInviteEmail).toHaveBeenCalledWith("boss@firm.co.uk", "Firm Ltd", expect.stringMatching(/^[0-9a-f]{128}$/), "admin");
  });

  it("tells a manager who already has an account to sign in", async () => {
    recipientStatus = "active";
    activeAdmins = 1;
    const res = await (await app()).inject({ method: "POST", url: url("/invite") });
    expect(res.statusCode).toBe(409);
    expect(sendTeamInviteEmail).not.toHaveBeenCalled();
  });
});

describe("POST /team/approval-links/:token/price-answer", () => {
  it("records the answer against the link's org, from the email link", async () => {
    const res = await (await app()).inject({ method: "POST", url: url("/price-answer"), payload: { answer: "gbp_4", comment: "ok" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.outcome).toBe("recorded");
    expect(p.appEvent.create.mock.calls[0][0].data).toMatchObject({
      type: "team.price_answer",
      userId: null,
      metadata: { orgId: "org-1", answer: "gbp_4", comment: "ok", via: "email_link" },
    });
  });

  it("rejects an answer that is not on the list", async () => {
    const res = await (await app()).inject({ method: "POST", url: url("/price-answer"), payload: { answer: "free" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("nominating drivers who have joined another company", () => {
  it("cannot be approved through their old manager's link", async () => {
    activeElsewhere.add("u-nia");
    const res = await (await app()).inject({ method: "POST", url: url("/approvals"), payload: { driverId: "m-nia", status: "approved" } });
    expect(res.statusCode).toBe(404);
    expect(p.teamApproval.upsert).not.toHaveBeenCalled();
  });
});

describe("account state for the invited manager", () => {
  it("an address with an account gets an invite to accept after signing in", async () => {
    p.user.findUnique.mockResolvedValue({ id: "u-boss", orgMemberships: [] });
    const a = await app();
    const get = await a.inject({ method: "GET", url: url() });
    expect(get.json().data).toMatchObject({ hasAccount: true, account: "exists" });
    const res = await a.inject({ method: "POST", url: url("/invite") });
    expect(res.statusCode).toBe(200);
    expect(sendTeamInviteEmail).toHaveBeenCalledTimes(1);
  });

  it("an address already active in another team is not sent an invite it could never accept", async () => {
    p.user.findUnique.mockResolvedValue({ id: "u-boss", orgMemberships: [{ id: "m-elsewhere" }] });
    const a = await app();
    const get = await a.inject({ method: "GET", url: url() });
    expect(get.json().data).toMatchObject({ hasAccount: true, account: "other_team" });
    const res = await a.inject({ method: "POST", url: url("/invite") });
    expect(res.statusCode).toBe(409);
    expect(p.orgMembership.update).not.toHaveBeenCalled();
    expect(sendTeamInviteEmail).not.toHaveBeenCalled();
  });
});

describe("POST /team/approval-links/:token/stop", () => {
  it("switches the invited manager off, logs it without the address, and the link dies", async () => {
    const a = await app();
    const res = await a.inject({ method: "POST", url: url("/stop"), payload: { reason: "not_my_team" } });
    expect(res.statusCode).toBe(200);
    expect(p.orgMembership.updateMany).toHaveBeenCalledWith({
      where: { orgId: "org-1", role: "admin", status: "invited", invitedEmail: "boss@firm.co.uk" },
      data: { status: "disabled", disabledAt: expect.any(Date), inviteTokenHash: null, inviteExpiresAt: null },
    });
    expect(logEvent).toHaveBeenCalledWith("team.manager_opted_out", null, {
      orgId: "org-1",
      reason: "not_my_team",
      via: "stop_page",
      memberships: 1,
    });
    expect(JSON.stringify((logEvent as any).mock.calls)).not.toContain("boss@firm.co.uk");

    const after = await a.inject({ method: "GET", url: url() });
    expect(after.statusCode).toBe(404);
  });

  it("accepts the mail client's RFC 8058 one-click POST", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: url("/stop"),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    expect(res.statusCode).toBe(200);
    expect(logEvent).toHaveBeenCalledWith(
      "team.manager_opted_out",
      null,
      expect.objectContaining({ via: "one_click", reason: "stop_emails" })
    );
  });

  it("does not let an active admin's link switch anyone off", async () => {
    recipientStatus = "active";
    activeAdmins = 1;
    const res = await (await app()).inject({ method: "POST", url: url("/stop") });
    expect(res.statusCode).toBe(409);
    expect(p.orgMembership.updateMany).not.toHaveBeenCalled();
  });

  it("is never a GET", async () => {
    const res = await (await app()).inject({ method: "GET", url: url("/stop") });
    expect(res.statusCode).toBe(404);
    expect(p.orgMembership.updateMany).not.toHaveBeenCalled();
  });
});
