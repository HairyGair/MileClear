/**
 * Practice accounts, the driver's side.
 *
 * Pins the consent flow: answering a practice's ask makes the link live
 * with the driver's chosen scopes (personal trips off unless they turn it
 * on) and logs it; sharing through a join code waits for the practice;
 * an expired ask is refused; stopping ends it at once, cancels open
 * requests and is logged; and requests close themselves when done.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    practiceLink: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    practice: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    practiceMember: { findMany: vi.fn(), findFirst: vi.fn() },
    practiceAccessLog: { create: vi.fn(), findMany: vi.fn() },
    practiceRequest: { findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    accountantAccess: { findMany: vi.fn(), delete: vi.fn() },
    accountantInvite: { updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    trip: { count: vi.fn() },
    earning: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../lib/push.js", () => ({ sendPushToUser: vi.fn().mockResolvedValue(null) }));
vi.mock("../../services/email.js", () => ({
  sendPracticeAccountantInviteEmail: vi.fn(),
  sendPracticeClientInviteEmail: vi.fn(),
  sendPracticeNoticeEmail: vi.fn(),
}));

import { practiceDriverRoutes } from "../../routes/practice/driver.js";
import { prisma } from "../../lib/prisma.js";
import { refreshAutoRequests } from "../../services/practice/requests.js";

const DAY = 86_400_000;
const DRIVER = "00000000-0000-0000-0000-00000000cc01";
const PRACTICE = "00000000-0000-0000-0000-00000000bb01";
const LINK = "00000000-0000-0000-0000-00000000ee01";
const auth = { authorization: `Bearer ${makeAccessToken(DRIVER)}` };

const practiceRow = {
  id: PRACTICE,
  name: "Smith & Co",
  contactName: "Jane Smith",
  professionalBody: "ICAEW",
  status: "unchecked",
  suspendedAt: null,
  logo: null,
};

function link(over: Record<string, unknown> = {}) {
  return {
    id: LINK,
    practiceId: PRACTICE,
    clientUserId: DRIVER,
    status: "invited",
    startedBy: "practice",
    invitedEmail: "dave@example.com",
    invitedPracticeEmail: null,
    inviteExpiresAt: new Date(Date.now() + 20 * DAY),
    invitedAt: new Date(Date.now() - DAY),
    consentedAt: null,
    startedAt: null,
    endsAt: null,
    endedAt: null,
    endedBy: null,
    renewalAskedAt: null,
    createdByMemberId: null,
    shareEarnings: true,
    shareExpenses: true,
    sharePersonalTrips: false,
    practice: practiceRow,
    ...over,
  };
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(practiceDriverRoutes, { prefix: "/practice-links" });
  return app;
}

describe("practice links, driver side", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.practiceAccessLog.create).mockResolvedValue({ id: "l", createdAt: new Date() } as never);
    vi.mocked(prisma.practiceLink.update).mockResolvedValue({} as never);
    vi.mocked(prisma.practice.findUnique).mockResolvedValue({ email: "books@example.com" } as never);
    vi.mocked(prisma.practiceMember.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.accountantAccess.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.practiceRequest.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ fullName: "Dave Mills", displayName: "Dave" } as never);
    app = await createTestApp();
  });

  it("answering a practice's ask makes the link live with the chosen scopes, and logs it", async () => {
    vi.mocked(prisma.practiceLink.findFirst).mockResolvedValue(link() as never);
    const res = await app.inject({
      method: "POST",
      url: "/practice-links/consent",
      headers: auth,
      payload: { linkId: LINK, shareEarnings: true, shareExpenses: false, sharePersonalTrips: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.state).toBe("sharing");
    const data = vi.mocked(prisma.practiceLink.update).mock.calls[0][0]!.data as Record<string, unknown>;
    expect(data).toMatchObject({
      status: "active",
      shareEarnings: true,
      shareExpenses: false,
      sharePersonalTrips: false,
      inviteTokenHash: null,
    });
    expect(data.consentedAt).toBeInstanceOf(Date);
    // Ends on a 31 January.
    const endsAt = data.endsAt as Date;
    expect(endsAt.getUTCMonth()).toBe(0);
    expect(endsAt.getUTCDate()).toBe(31);
    expect(vi.mocked(prisma.practiceAccessLog.create).mock.calls[0][0]!.data).toMatchObject({
      action: "started_sharing",
      clientUserId: DRIVER,
      actorName: null,
    });
  });

  it("only answers the driver's own links", async () => {
    vi.mocked(prisma.practiceLink.findFirst).mockResolvedValue(null as never);
    const res = await app.inject({
      method: "POST",
      url: "/practice-links/consent",
      headers: auth,
      payload: { linkId: LINK, shareEarnings: true, shareExpenses: true, sharePersonalTrips: false },
    });
    expect(res.statusCode).toBe(404);
    expect(vi.mocked(prisma.practiceLink.findFirst).mock.calls[0][0]!.where).toMatchObject({ clientUserId: DRIVER });
    expect(prisma.practiceLink.update).not.toHaveBeenCalled();
  });

  it("refuses an ask that has expired", async () => {
    vi.mocked(prisma.practiceLink.findFirst).mockResolvedValue(
      link({ inviteExpiresAt: new Date(Date.now() - 1000) }) as never
    );
    const res = await app.inject({
      method: "POST",
      url: "/practice-links/consent",
      headers: auth,
      payload: { linkId: LINK, shareEarnings: true, shareExpenses: true, sharePersonalTrips: false },
    });
    expect(res.statusCode).toBe(410);
    expect(prisma.practiceLink.update).not.toHaveBeenCalled();
  });

  it("sharing through a join code waits for the practice to accept", async () => {
    vi.mocked(prisma.practice.findUnique).mockImplementation((async (args: { where: { joinCode?: string } }) =>
      args.where.joinCode ? practiceRow : { email: "books@example.com" }) as never);
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.practiceLink.create).mockResolvedValue({ id: LINK } as never);
    vi.mocked(prisma.practiceLink.findFirst).mockResolvedValue(
      link({ status: "pending_practice", startedBy: "driver", inviteExpiresAt: null }) as never
    );
    const res = await app.inject({
      method: "POST",
      url: "/practice-links/consent",
      headers: auth,
      payload: { code: "SMTHC2AB", shareEarnings: true, shareExpenses: true, sharePersonalTrips: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.state).toBe("waiting_for_practice");
    const data = vi.mocked(prisma.practiceLink.update).mock.calls[0][0]!.data as Record<string, unknown>;
    expect(data.status).toBe("pending_practice");
    expect(data.startedAt).toBeNull();
    expect(data.endsAt).toBeNull();
    // Nothing is shared yet, so nothing to log.
    expect(prisma.practiceAccessLog.create).not.toHaveBeenCalled();
  });

  it("stop sharing ends the link at once, cancels open requests and logs it", async () => {
    vi.mocked(prisma.practiceLink.findFirst).mockResolvedValue(
      link({ status: "active", consentedAt: new Date(), startedAt: new Date(), endsAt: new Date(Date.now() + 100 * DAY) }) as never
    );
    const res = await app.inject({ method: "POST", url: `/practice-links/${LINK}/stop`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(prisma.practiceLink.update).mock.calls[0][0]!.data).toMatchObject({ status: "ended", endedBy: "driver" });
    expect(vi.mocked(prisma.practiceRequest.updateMany).mock.calls[0][0]!).toMatchObject({
      where: { clientUserId: DRIVER, practiceId: PRACTICE, status: "open" },
      data: { status: "cancelled" },
    });
    expect(vi.mocked(prisma.practiceAccessLog.create).mock.calls[0][0]!.data.action).toBe("stopped_sharing");
  });

  it("only the driver changes what is shared, including personal trips", async () => {
    vi.mocked(prisma.practiceLink.findFirst).mockResolvedValue(
      link({ status: "active", consentedAt: new Date(), startedAt: new Date(), endsAt: new Date(Date.now() + 100 * DAY) }) as never
    );
    const res = await app.inject({
      method: "PATCH",
      url: `/practice-links/${LINK}/scopes`,
      headers: auth,
      payload: { shareEarnings: true, shareExpenses: true, sharePersonalTrips: true },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(prisma.practiceLink.update).mock.calls[0][0]!.data).toEqual({
      shareEarnings: true,
      shareExpenses: true,
      sharePersonalTrips: true,
    });
    expect(vi.mocked(prisma.practiceAccessLog.create).mock.calls[0][0]!.data.action).toBe("changed_sharing");
  });

  it("report ends the ask and flags the practice", async () => {
    vi.mocked(prisma.practiceLink.findFirst).mockResolvedValue(link() as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    const res = await app.inject({ method: "POST", url: `/practice-links/${LINK}/report`, headers: auth, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(vi.mocked(prisma.practice.update).mock.calls[0][0]).toMatchObject({
      where: { id: PRACTICE },
      data: { reportCount: { increment: 1 } },
    });
  });
});

describe("requests close themselves", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes 'sort your trips' when nothing is left to sort, and 'add earnings' once one is logged", async () => {
    vi.mocked(prisma.practiceRequest.findMany).mockResolvedValue([
      { id: "r1", clientUserId: DRIVER, type: "sort_trips", periodStart: new Date("2026-04-06T00:00:00Z"), periodEnd: new Date("2027-04-05T00:00:00Z") },
      { id: "r2", clientUserId: DRIVER, type: "add_earnings", periodStart: new Date("2026-07-06T00:00:00Z"), periodEnd: new Date("2026-10-05T00:00:00Z") },
      { id: "r3", clientUserId: DRIVER, type: "add_earnings", periodStart: new Date("2026-04-06T00:00:00Z"), periodEnd: new Date("2026-07-05T00:00:00Z") },
    ] as never);
    vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.earning.count).mockResolvedValueOnce(2 as never).mockResolvedValueOnce(0 as never);
    vi.mocked(prisma.practiceRequest.updateMany).mockResolvedValue({ count: 2 } as never);
    const n = await refreshAutoRequests([DRIVER], new Date("2026-10-11T12:00:00Z"));
    expect(n).toBe(2);
    expect(vi.mocked(prisma.practiceRequest.updateMany).mock.calls[0][0]).toMatchObject({
      where: { id: { in: ["r1", "r2"] }, status: "open" },
      data: { status: "done", doneHow: "auto" },
    });
  });

  it("leaves a sort request open while trips are still unsorted", async () => {
    vi.mocked(prisma.practiceRequest.findMany).mockResolvedValue([
      { id: "r1", clientUserId: DRIVER, type: "sort_trips", periodStart: new Date("2026-04-06T00:00:00Z"), periodEnd: new Date("2027-04-05T00:00:00Z") },
    ] as never);
    vi.mocked(prisma.trip.count).mockResolvedValue(4 as never);
    expect(await refreshAutoRequests([DRIVER])).toBe(0);
    expect(prisma.practiceRequest.updateMany).not.toHaveBeenCalled();
  });
});
