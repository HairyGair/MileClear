/**
 * Milesheet monthly approval emails (Oct 2026 extension of the Aug 2026 job).
 *
 * (a) Active admins get "last month is ready" with an approve link.
 * (b) Orgs with no active admin whose manager is still invited: the invited
 *     address gets "<drivers> asked you to approve their <month> mileage",
 *     counting the nominating driver (invited, with a userId).
 * Both deduped by AppEvent; dry run sends nothing and makes no links.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    organisation: { findMany: vi.fn() },
    orgMembership: { findMany: vi.fn(), count: vi.fn() },
    appEvent: { findFirst: vi.fn(), create: vi.fn() },
    teamApprovalLink: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("../../services/email.js", () => ({
  sendTeamMonthReadyEmail: vi.fn().mockResolvedValue(undefined),
  sendTeamApprovalRequestEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/teamExport.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../services/teamExport.js")>();
  return { ...real, computeTeamMonthSummary: vi.fn() };
});

import { prisma } from "../../lib/prisma.js";
import { joinDriverNames, runTeamMonthReadyJob } from "../../jobs/teamApprovals.js";
import { sendTeamApprovalRequestEmail, sendTeamMonthReadyEmail } from "../../services/email.js";
import { computeTeamMonthSummary } from "../../services/teamExport.js";
import { emailFingerprint } from "../../services/teamApprovalLinks.js";

const p = prisma as any;

// 2 Nov 2026 10:00 London (GMT): inside the window, after 08:00.
const NOW = new Date("2026-11-02T10:00:00Z");

type M = { orgId: string; role: string; status: string; userId: string | null; invitedEmail: string; email?: string };
let memberships: M[] = [];
let events: Array<{ type: string; userId: string | null; metadata: Record<string, unknown> }> = [];

function statusOk(where: any, status: string) {
  if (typeof where.status === "string") return where.status === status;
  if (where.status?.in) return where.status.in.includes(status);
  return true;
}
function memberMatch(where: any, m: M) {
  return (
    m.orgId === where.orgId &&
    m.role === where.role &&
    statusOk(where, m.status) &&
    (where.userId === undefined || m.userId !== null)
  );
}

function driverRow(userId: string, displayName: string | null, miles: number) {
  return { membershipId: `m-${userId}`, userId, displayName, email: `${userId}@x.com`, businessMiles: miles, amountPence: Math.round(miles * 55) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  delete process.env.TEAM_MONTH_READY_DRY_RUN;

  events = [];
  memberships = [
    // org-active: a manager who signed up, one active driver.
    { orgId: "org-active", role: "admin", status: "active", userId: "u-boss", invitedEmail: "boss@a.com", email: "boss@a.com" },
    { orgId: "org-active", role: "driver", status: "active", userId: "u-d1", invitedEmail: "d1@a.com" },
    // org-nominated: the manager never signed up; the driver who nominated
    // them is still "invited" with a userId.
    { orgId: "org-nominated", role: "admin", status: "invited", userId: null, invitedEmail: "Manager@B.com" },
    { orgId: "org-nominated", role: "driver", status: "invited", userId: "u-nia", invitedEmail: "nia@b.com" },
    // org-empty: invited manager, an admin-invited driver who never joined.
    { orgId: "org-empty", role: "admin", status: "invited", userId: null, invitedEmail: "c@c.com" },
    { orgId: "org-empty", role: "driver", status: "invited", userId: null, invitedEmail: "nobody@c.com" },
  ];

  p.organisation.findMany.mockResolvedValue([
    { id: "org-active", name: "Active Ltd" },
    { id: "org-nominated", name: "Nominated Ltd" },
    { id: "org-empty", name: "Empty Ltd" },
  ]);
  p.orgMembership.findMany.mockImplementation(async ({ where }: any) =>
    memberships
      .filter((m) => memberMatch(where, m))
      .map((m) => ({ userId: m.userId, invitedEmail: m.invitedEmail, user: m.email ? { email: m.email } : null }))
  );
  p.orgMembership.count.mockImplementation(async ({ where }: any) => memberships.filter((m) => memberMatch(where, m)).length);
  p.appEvent.findFirst.mockImplementation(async ({ where }: any) => {
    return (
      events.find((e) => {
        if (e.type !== where.type) return false;
        if (where.userId !== undefined && e.userId !== where.userId) return false;
        return (where.AND ?? []).every((a: any) => e.metadata[a.metadata.path.replace("$.", "")] === a.metadata.equals);
      }) ?? null
    );
  });
  p.appEvent.create.mockImplementation(async ({ data }: any) => {
    events.push({ type: data.type, userId: data.userId ?? null, metadata: data.metadata });
    return {};
  });
  (computeTeamMonthSummary as any).mockImplementation(async (orgId: string) => {
    if (orgId === "org-active") return { drivers: [driverRow("u-d1", "Dee", 50)], totalMiles: 50, totalAmountPence: 2750 };
    if (orgId === "org-nominated") return { drivers: [driverRow("u-nia", "Nia", 120.4)], totalMiles: 120.4, totalAmountPence: 6622 };
    return { drivers: [], totalMiles: 0, totalAmountPence: 0 };
  });
});

afterEach(() => vi.useRealTimers());

describe("runTeamMonthReadyJob", () => {
  it("emails the active admin with an approve link, and the invited manager with the totals", async () => {
    await runTeamMonthReadyJob(NOW);

    // (a)
    expect(sendTeamMonthReadyEmail).toHaveBeenCalledTimes(1);
    expect(sendTeamMonthReadyEmail).toHaveBeenCalledWith("boss@a.com", "Active Ltd", "October 2026", expect.stringMatching(/^[0-9a-f]{128}$/));
    expect(computeTeamMonthSummary).toHaveBeenCalledWith("org-active", "2026-10");

    // (b) the nominating driver counts, only on this path.
    expect(computeTeamMonthSummary).toHaveBeenCalledWith("org-nominated", "2026-10", { includeNominatingDrivers: true });
    expect(sendTeamApprovalRequestEmail).toHaveBeenCalledTimes(1);
    expect(sendTeamApprovalRequestEmail).toHaveBeenCalledWith("manager@b.com", {
      orgName: "Nominated Ltd",
      monthLabel: "October 2026",
      driverNames: "Nia",
      driverCount: 1,
      totalMiles: 120.4,
      totalAmountPence: 6622,
      approveToken: expect.stringMatching(/^[0-9a-f]{128}$/),
    });

    // One link per email, each for its own org and last month.
    const links = p.teamApprovalLink.create.mock.calls.map((c: any[]) => c[0].data);
    expect(links).toHaveLength(2);
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orgId: "org-active", month: "2026-10", recipientEmail: "boss@a.com" }),
        expect.objectContaining({ orgId: "org-nominated", month: "2026-10", recipientEmail: "manager@b.com" }),
      ])
    );

    // org-empty has no driver with an account: nothing sent, nothing computed.
    expect(computeTeamMonthSummary).not.toHaveBeenCalledWith("org-empty", expect.anything(), expect.anything());

    // Dedup records: by user for (a), by org + fingerprint (no address) for (b).
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "team.month_ready_2026-10", userId: "u-boss", metadata: { orgId: "org-active", month: "2026-10" } },
        {
          type: "team.month_link_2026-10",
          userId: null,
          metadata: { orgId: "org-nominated", month: "2026-10", recipient: emailFingerprint("manager@b.com") },
        },
      ])
    );
    expect(JSON.stringify(events)).not.toContain("manager@b.com");
  });

  it("does not email anyone twice for the same month", async () => {
    await runTeamMonthReadyJob(NOW);
    vi.clearAllMocks();
    await runTeamMonthReadyJob(new Date("2026-11-02T10:30:00Z"));
    expect(sendTeamMonthReadyEmail).not.toHaveBeenCalled();
    expect(sendTeamApprovalRequestEmail).not.toHaveBeenCalled();
    expect(p.teamApprovalLink.create).not.toHaveBeenCalled();
    // Once everyone has been told, no month is recomputed either.
    expect(computeTeamMonthSummary).not.toHaveBeenCalled();
  });

  it("an org whose manager has signed up never gets the invited-manager email", async () => {
    // A second, still-invited admin in the active org is not emailed.
    memberships.push({ orgId: "org-active", role: "admin", status: "invited", userId: null, invitedEmail: "second@a.com" });
    await runTeamMonthReadyJob(NOW);
    expect(sendTeamApprovalRequestEmail).not.toHaveBeenCalledWith("second@a.com", expect.anything());
  });

  it("the active-admin path still ignores invited drivers", async () => {
    memberships = memberships.filter((m) => !(m.orgId === "org-active" && m.role === "driver"));
    memberships.push({ orgId: "org-active", role: "driver", status: "invited", userId: "u-pending", invitedEmail: "p@a.com" });
    await runTeamMonthReadyJob(NOW);
    expect(sendTeamMonthReadyEmail).not.toHaveBeenCalled();
  });

  it("skips orgs with no business miles last month", async () => {
    (computeTeamMonthSummary as any).mockResolvedValue({ drivers: [driverRow("u-nia", "Nia", 0)], totalMiles: 0, totalAmountPence: 0 });
    await runTeamMonthReadyJob(NOW);
    expect(sendTeamMonthReadyEmail).not.toHaveBeenCalled();
    expect(sendTeamApprovalRequestEmail).not.toHaveBeenCalled();
  });

  it("holds the invited-manager email until 08:00 London", async () => {
    const early = new Date("2026-11-01T00:30:00Z");
    vi.setSystemTime(early);
    await runTeamMonthReadyJob(early);
    expect(sendTeamMonthReadyEmail).toHaveBeenCalledTimes(1);
    expect(sendTeamApprovalRequestEmail).not.toHaveBeenCalled();
  });

  it("does nothing after the 4th", async () => {
    const late = new Date("2026-11-05T10:00:00Z");
    vi.setSystemTime(late);
    await runTeamMonthReadyJob(late);
    expect(p.organisation.findMany).not.toHaveBeenCalled();
  });

  it("dry run sends nothing and creates no links", async () => {
    process.env.TEAM_MONTH_READY_DRY_RUN = "1";
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runTeamMonthReadyJob(NOW);
    expect(sendTeamMonthReadyEmail).not.toHaveBeenCalled();
    expect(sendTeamApprovalRequestEmail).not.toHaveBeenCalled();
    expect(p.teamApprovalLink.create).not.toHaveBeenCalled();
    expect(p.appEvent.create).not.toHaveBeenCalled();
    // The invited manager's address is never logged.
    expect(JSON.stringify(spy.mock.calls)).not.toContain("manager@b.com");
    spy.mockRestore();
    delete process.env.TEAM_MONTH_READY_DRY_RUN;
  });

  it("a failed send leaves no dedup record, so the next tick tries again", async () => {
    (sendTeamApprovalRequestEmail as any).mockRejectedValueOnce(new Error("smtp"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await runTeamMonthReadyJob(NOW);
    expect(events.some((e) => e.type === "team.month_link_2026-10")).toBe(false);
    await runTeamMonthReadyJob(NOW);
    expect(sendTeamApprovalRequestEmail).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe("joinDriverNames", () => {
  it("reads naturally and never invents a name", () => {
    expect(joinDriverNames(["Sam"])).toBe("Sam");
    expect(joinDriverNames(["Sam", "Jo"])).toBe("Sam and Jo");
    expect(joinDriverNames(["Sam", "Jo", "Ali"])).toBe("Sam, Jo and Ali");
    expect(joinDriverNames(["Sam", "Jo", "Ali", "Bo"])).toBe("Sam, Jo and 2 others");
    expect(joinDriverNames(["Sam", null])).toBe("Sam and 1 other");
    expect(joinDriverNames([null])).toBe("Your driver");
    expect(joinDriverNames([null, " "])).toBe("Your drivers");
  });
});
