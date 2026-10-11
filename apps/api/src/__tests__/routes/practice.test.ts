/**
 * Practice accounts, the accountant's side.
 *
 * Pins the authorisation rules: not a member, no link, an unanswered or
 * pending link, a stopped or expired one, and another practice's client are
 * all refused. A live link sees business trips only unless the driver turned
 * on personal trips, downloads are business only, every read writes an
 * access-log row first (and a failed write means no data), and requests
 * respect "nothing to sort" and the weekly limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    practiceMember: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    practice: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    practiceLink: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    practiceAccessLog: { create: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
    practiceRequest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    trip: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    earning: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    expense: { findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    hmrcConnection: { findFirst: vi.fn(), findMany: vi.fn() },
    appEvent: { findMany: vi.fn() },
    accountantAccess: { findMany: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../lib/push.js", () => ({ sendPushToUser: vi.fn().mockResolvedValue(null) }));
vi.mock("../../services/email.js", () => ({
  sendPracticeStaffInviteEmail: vi.fn(),
  sendPracticeClientInviteEmail: vi.fn(),
  sendPracticeNoticeEmail: vi.fn(),
}));
vi.mock("../../services/export.js", () => ({
  generateTripsCsv: vi.fn().mockResolvedValue("Date,From,To\r\n"),
  generateTripsPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")),
  generateSelfAssessmentPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-summary")),
  canSafelyEmbedImage: vi.fn().mockReturnValue(true),
}));
vi.mock("../../services/periodFigures.js", () => ({ loadPeriodFigures: vi.fn() }));

import { practiceRoutes } from "../../routes/practice/index.js";
import { prisma } from "../../lib/prisma.js";
import { generateTripsCsv, generateSelfAssessmentPdf } from "../../services/export.js";
import { sendPushToUser } from "../../lib/push.js";

const DAY = 86_400_000;
const USER = "00000000-0000-0000-0000-00000000aa01";
const PRACTICE = "00000000-0000-0000-0000-00000000bb01";
const CLIENT = "00000000-0000-0000-0000-00000000cc01";
const token = makeAccessToken(USER);
const auth = { authorization: `Bearer ${token}` };

const memberRow = {
  id: "00000000-0000-0000-0000-00000000dd01",
  role: "owner",
  practice: { id: PRACTICE, name: "Smith & Co", status: "unchecked", suspendedAt: null },
  user: { displayName: "Jane", fullName: "Jane Smith", email: "jane@example.com" },
};

function linkRow(over: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-00000000ee01",
    practiceId: PRACTICE,
    clientUserId: CLIENT,
    status: "active",
    startedBy: "practice",
    consentedAt: new Date(Date.now() - 10 * DAY),
    startedAt: new Date(Date.now() - 10 * DAY),
    endsAt: new Date(Date.now() + 300 * DAY),
    endedAt: null,
    endedBy: null,
    renewalAskedAt: null,
    shareEarnings: true,
    shareExpenses: true,
    sharePersonalTrips: false,
    ...over,
  };
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(practiceRoutes, { prefix: "/practice" });
  return app;
}

describe("practice routes", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.practiceMember.findFirst).mockResolvedValue(memberRow as never);
    vi.mocked(prisma.practiceAccessLog.create).mockResolvedValue({ id: "log1", createdAt: new Date() } as never);
    vi.mocked(prisma.practiceRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.practiceRequest.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.trip.aggregate).mockResolvedValue({
      _count: { _all: 0 },
      _min: { startedAt: null },
      _max: { startedAt: null },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ fullName: "Dave Mills", displayName: "Dave" } as never);
    app = await createTestApp();
  });

  // ── Who may look ─────────────────────────────────────────────────────

  it("refuses someone who is not in a practice", async () => {
    vi.mocked(prisma.practiceMember.findFirst).mockResolvedValue(null as never);
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips`, headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("no_practice");
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });

  it("refuses without a sign-in", async () => {
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips` });
    expect(res.statusCode).toBe(401);
  });

  it("looks the link up for the member's own practice only (another practice's client is not found)", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(null as never);
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips`, headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("no_link");
    expect(vi.mocked(prisma.practiceLink.findUnique).mock.calls[0][0]).toMatchObject({
      where: { practiceId_clientUserId: { practiceId: PRACTICE, clientUserId: CLIENT } },
    });
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
    expect(prisma.practiceAccessLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["an invite not answered yet", { status: "invited", consentedAt: null, startedAt: null }, "not_answered"],
    ["a driver ask not accepted yet", { status: "pending_practice", startedAt: null }, "waiting_for_practice"],
    ["a driver who stopped sharing", { status: "ended", endedBy: "driver", endedAt: new Date() }, "stopped"],
    ["a link past its end date", { endsAt: new Date(Date.now() - 1000) }, "ended"],
    ["a link with no end date", { endsAt: null }, "ended"],
  ])("refuses %s", async (_label, over, code) => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow(over) as never);
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips`, headers: auth });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe(code);
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
    expect(prisma.practiceAccessLog.create).not.toHaveBeenCalled();
  });

  it("refuses everything while the practice is paused", async () => {
    vi.mocked(prisma.practiceMember.findFirst).mockResolvedValue({
      ...memberRow,
      practice: { ...memberRow.practice, suspendedAt: new Date() },
    } as never);
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips`, headers: auth });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("practice_paused");
  });

  // ── Client list ──────────────────────────────────────────────────────

  it("lists live clients with business miles only, and never names an invitee before they say yes", async () => {
    const liveClient = {
      id: CLIENT,
      email: "dave@example.com",
      fullName: "Dave Mills",
      displayName: "Dave",
      workType: "gig",
      lastTripAt: null,
      vehicles: [{ vehicleType: "car", isPrimary: true }],
    };
    const invitee = { ...liveClient, id: "00000000-0000-0000-0000-00000000cc09", email: "pat@example.com", fullName: "Account Name" };
    vi.mocked(prisma.practiceLink.findMany).mockResolvedValue([
      { ...linkRow(), invitedEmail: null, invitedName: null, inviteExpiresAt: null, invitedAt: null, lastResentAt: null, askedAgainAt: null, updatedAt: new Date(), client: liveClient },
      {
        ...linkRow({ id: "00000000-0000-0000-0000-00000000ee09", status: "invited", consentedAt: null, startedAt: null, endsAt: null }),
        clientUserId: invitee.id,
        invitedEmail: "pat@example.com",
        invitedName: "Pat (as typed)",
        inviteExpiresAt: new Date(Date.now() + 10 * DAY),
        invitedAt: new Date(),
        lastResentAt: null,
        askedAgainAt: null,
        updatedAt: new Date(),
        client: invitee,
      },
    ] as never);
    vi.mocked(prisma.trip.groupBy).mockImplementation((async (args: { where: { classification: string } }) =>
      args.where.classification === "business"
        ? [{ userId: CLIENT, _sum: { distanceMiles: 120.44 } }]
        : [{ userId: CLIENT, _count: { _all: 7 } }]) as never);
    vi.mocked(prisma.earning.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.expense.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.hmrcConnection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.appEvent.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.practiceRequest.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.practiceAccessLog.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.practiceAccessLog.createMany).mockResolvedValue({ count: 1 } as never);

    const res = await app.inject({ method: "GET", url: "/practice/clients", headers: auth });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.clients).toHaveLength(1);
    expect(data.clients[0]).toMatchObject({ clientId: CLIENT, businessMiles: 120.4, toSort: 7, earningsCount: 0 });
    // Only the live client's totals were read, and only business miles.
    const bizCall = vi.mocked(prisma.trip.groupBy).mock.calls.find((c) => (c[0] as { where: { classification: string } }).where.classification === "business")!;
    expect((bizCall[0] as { where: { userId: { in: string[] } } }).where.userId).toEqual({ in: [CLIENT] });
    expect(data.waiting).toEqual([
      expect.objectContaining({ state: "waiting_for_client", name: "Pat (as typed)", email: "pat@example.com", clientId: null }),
    ]);
    expect(JSON.stringify(data)).not.toContain("Account Name");
    // The list view is logged once per client per day.
    expect(vi.mocked(prisma.practiceAccessLog.createMany).mock.calls[0][0]!.data).toEqual([
      expect.objectContaining({ clientUserId: CLIENT, action: "viewed_list" }),
    ]);
  });

  // ── Business only ────────────────────────────────────────────────────

  it("lists business trips only when personal trips are not shared, even if asked for them", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow() as never);
    const res = await app.inject({
      method: "GET",
      url: `/practice/clients/${CLIENT}/trips?show=all`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.personalShared).toBe(false);
    const where = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.classification).toEqual({ in: ["business"] });
    expect(where.userId).toBe(CLIENT);
  });

  it("shows personal trips only when the driver turned them on", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow({ sharePersonalTrips: true }) as never);
    await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips?show=personal`, headers: auth });
    const where = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.classification).toEqual({ in: ["personal"] });
  });

  it("returns unsorted trips as a count and dates, never as rows", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow() as never);
    vi.mocked(prisma.trip.aggregate).mockResolvedValue({
      _count: { _all: 12 },
      _min: { startedAt: new Date("2026-09-08T08:00:00Z") },
      _max: { startedAt: new Date("2026-10-04T08:00:00Z") },
    } as never);
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips`, headers: auth });
    expect(res.json().data.unsorted.count).toBe(12);
    expect(JSON.stringify(res.json().data.unsorted)).not.toMatch(/Address/i);
  });

  it("hides earnings the driver chose not to share, and logs nothing for them", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow({ shareEarnings: false }) as never);
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/earnings`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.shared).toBe(false);
    expect(prisma.earning.findMany).not.toHaveBeenCalled();
    expect(prisma.practiceAccessLog.create).not.toHaveBeenCalled();
  });

  // ── Access log ───────────────────────────────────────────────────────

  it("logs the read with the staff member's name before returning data", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow() as never);
    await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips`, headers: auth });
    const log = vi.mocked(prisma.practiceAccessLog.create).mock.calls[0][0]!.data;
    expect(log).toMatchObject({
      practiceId: PRACTICE,
      practiceName: "Smith & Co",
      actorName: "Jane Smith",
      clientUserId: CLIENT,
      action: "viewed_trips",
    });
    const logOrder = vi.mocked(prisma.practiceAccessLog.create).mock.invocationCallOrder[0];
    const readOrder = vi.mocked(prisma.trip.findMany).mock.invocationCallOrder[0];
    expect(logOrder).toBeLessThan(readOrder);
  });

  it("fails the read when the log cannot be written", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow() as never);
    vi.mocked(prisma.practiceAccessLog.create).mockRejectedValue(new Error("db down"));
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/trips`, headers: auth });
    expect(res.statusCode).toBe(500);
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });

  // ── Exports ──────────────────────────────────────────────────────────

  it("exports business trips only, named after the client, and logs the download", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow({ sharePersonalTrips: true }) as never);
    const res = await app.inject({
      method: "GET",
      url: `/practice/clients/${CLIENT}/export?format=csv&period=last_tax_year`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(generateTripsCsv).mock.calls[0][1]).toMatchObject({ classification: "business" });
    expect(res.headers["content-disposition"]).toMatch(/mileclear-dave-mills-\d{4}-\d{2}-trips\.csv/);
    expect(vi.mocked(prisma.practiceAccessLog.create).mock.calls[0][0]!.data.action).toBe("exported_csv");
  });

  it("the tax year summary PDF is business only and leaves out unshared earnings", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow({ shareEarnings: false }) as never);
    const res = await app.inject({ method: "GET", url: `/practice/clients/${CLIENT}/export?format=summary`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(generateSelfAssessmentPdf).mock.calls[0][2]).toEqual({ businessOnly: true, includeEarnings: false });
  });

  it("the zip skips clients who are not sharing", async () => {
    const other = "00000000-0000-0000-0000-00000000cc02";
    vi.mocked(prisma.practiceLink.findUnique).mockImplementation((async (args: {
      where: { practiceId_clientUserId: { clientUserId: string } };
    }) => (args.where.practiceId_clientUserId.clientUserId === CLIENT ? linkRow() : linkRow({ status: "ended", endedBy: "driver" }))) as never);
    const res = await app.inject({
      method: "POST",
      url: "/practice/export",
      headers: auth,
      payload: { clientIds: [CLIENT, other], format: "csv" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["x-skipped-clients"]).toBe("1");
    expect(vi.mocked(generateTripsCsv)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateTripsCsv).mock.calls[0][0]).toBe(CLIENT);
  });

  // ── Requests ─────────────────────────────────────────────────────────

  it("skips 'sort your trips' for a client with nothing to sort", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow() as never);
    vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
    const res = await app.inject({
      method: "POST",
      url: "/practice/requests",
      headers: auth,
      payload: { clientIds: [CLIENT], type: "sort_trips" },
    });
    expect(res.json().data).toMatchObject({ sent: 0, nothingToSort: [CLIENT] });
    expect(prisma.practiceRequest.create).not.toHaveBeenCalled();
  });

  it("sends a sort request with the count, pushes it and logs it", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow() as never);
    vi.mocked(prisma.trip.count).mockResolvedValue(12 as never);
    vi.mocked(prisma.practiceRequest.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.practiceRequest.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.practiceRequest.create).mockResolvedValue({
      id: "00000000-0000-0000-0000-00000000ff01",
      practiceId: PRACTICE,
      clientUserId: CLIENT,
      type: "sort_trips",
      note: null,
      dueDate: new Date("2026-10-31T00:00:00Z"),
      periodStart: null,
      periodEnd: null,
      countAtSend: 12,
      status: "open",
      doneHow: null,
      doneAt: null,
      driverReply: null,
      repliedAt: null,
      lastRemindedAt: null,
      createdByName: "Jane Smith",
      createdAt: new Date(),
    } as never);
    const res = await app.inject({
      method: "POST",
      url: "/practice/requests",
      headers: auth,
      payload: { clientIds: [CLIENT], type: "sort_trips", dueDate: "2026-10-31" },
    });
    expect(res.json().data.sent).toBe(1);
    expect(vi.mocked(prisma.practiceRequest.create).mock.calls[0][0]!.data).toMatchObject({ countAtSend: 12, type: "sort_trips" });
    expect(vi.mocked(sendPushToUser).mock.calls[0]).toEqual([
      CLIENT,
      "Smith & Co",
      "Please sort your trips (12). Due 31 Oct.",
      { action: "practice_request", requestId: "00000000-0000-0000-0000-00000000ff01" },
    ]);
    expect(vi.mocked(prisma.practiceAccessLog.create).mock.calls[0][0]!.data.action).toBe("sent_request");
  });

  it("stops at 3 requests a client a week", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow() as never);
    vi.mocked(prisma.practiceRequest.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.practiceRequest.count).mockResolvedValue(3 as never);
    const res = await app.inject({
      method: "POST",
      url: "/practice/requests",
      headers: auth,
      payload: { clientIds: [CLIENT], type: "check_details" },
    });
    expect(res.json().data).toMatchObject({ sent: 0, overLimit: [CLIENT] });
    expect(prisma.practiceRequest.create).not.toHaveBeenCalled();
  });

  it("will not send a request to someone who is not sharing", async () => {
    vi.mocked(prisma.practiceLink.findUnique).mockResolvedValue(linkRow({ status: "pending_practice" }) as never);
    const res = await app.inject({
      method: "POST",
      url: "/practice/requests",
      headers: auth,
      payload: { clientIds: [CLIENT], type: "check_details" },
    });
    expect(res.json().data).toMatchObject({ sent: 0, notSharing: [CLIENT] });
  });
});
