/**
 * The accountant link, end to end at the API.
 *
 * Until Oct 2026 the portal never worked: the emailed link went straight to
 * the page, but access was only created by GET /accountant/verify, which
 * nothing called. The page then expected a different response shape, the
 * tax year picker was ignored, revoked and expired links both showed
 * "Something went wrong", and the summary counted personal miles.
 *
 * These tests pin: accepting an invite (and accepting again), the response
 * shape the page reads, business-only figures, the chosen tax year, and the
 * codes behind the revoked and expired messages.
 */
import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    accountantAccess: { findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    accountantInvite: { findFirst: vi.fn(), update: vi.fn() },
    mileageSummary: { findMany: vi.fn() },
    trip: { groupBy: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/email.js", () => ({
  sendAccountantInviteEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/export.js", () => ({
  generateTripsCsv: vi.fn().mockResolvedValue("Date,From,To\r\n"),
  generateTripsPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")),
}));
vi.mock("../../services/export-data.js", () => ({
  fetchExportSummary: vi.fn(),
  fetchExpenseSummary: vi.fn(),
}));

import { accountantRoutes } from "../../routes/accountant/index.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { fetchExportSummary, fetchExpenseSummary } from "../../services/export-data.js";
import { generateTripsCsv } from "../../services/export.js";

const TOKEN = "ab".repeat(64);
const TOKEN_HASH = crypto.createHash("sha256").update(TOKEN).digest("hex");
const USER_ID = "00000000-0000-0000-0000-0000000000a1";
const DAY = 24 * 60 * 60 * 1000;

const inFuture = (days: number) => new Date(Date.now() + days * DAY);

const pendingInvite = {
  id: "00000000-0000-0000-0000-0000000000b1",
  userId: USER_ID,
  email: "books@example.com",
  status: "pending",
  expiresAt: inFuture(6),
};

const liveAccess = {
  id: "00000000-0000-0000-0000-0000000000c1",
  userId: USER_ID,
  accountantEmail: "books@example.com",
  expiresAt: inFuture(300),
  user: { id: USER_ID, displayName: "Sam", fullName: "Sam Driver", email: "sam@example.com" },
};

async function createTestApp() {
  const app = await buildApp();
  await app.register(accountantRoutes, { prefix: "/accountant" });
  return app;
}

/** Access row lookup: what accountantAccess.findFirst returns. */
function accessIs(row: unknown) {
  vi.mocked(prisma.accountantAccess.findFirst).mockResolvedValue(row as never);
}

/** Invite lookups, matched on the status filter the route passes. */
function invitesAre(byStatus: { accepted?: unknown; pending?: unknown; any?: unknown }) {
  vi.mocked(prisma.accountantInvite.findFirst).mockImplementation((async (args: {
    where: { status?: string };
  }) => {
    const s = args.where.status;
    if (s === "accepted") return byStatus.accepted ?? null;
    if (s === "pending") return byStatus.pending ?? null;
    return byStatus.any ?? null;
  }) as never);
}

describe("accountant link", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    vi.mocked(prisma.accountantAccess.update).mockResolvedValue({} as never);
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      { taxYear: "2025-26" },
    ] as never);
    vi.mocked(prisma.trip.groupBy).mockResolvedValue([
      { classification: "business", _count: { _all: 12 }, _sum: { distanceMiles: 340.456 } },
      { classification: "personal", _count: { _all: 30 }, _sum: { distanceMiles: 900 } },
      { classification: "unclassified", _count: { _all: 4 }, _sum: { distanceMiles: 51 } },
    ] as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
    vi.mocked(fetchExportSummary).mockResolvedValue({
      taxYear: "2025-26",
      totalTrips: 46,
      totalMiles: 1291.46,
      businessMiles: 340.46,
      personalMiles: 951,
      vehicleBreakdown: [
        { vehicleName: "Toyota Prius", vehicleType: "car", totalMiles: 1200, businessMiles: 340.46, deductionPence: 15321 },
        { vehicleName: "Partner's car", vehicleType: "car", totalMiles: 91, businessMiles: 0, deductionPence: 0 },
      ],
      monthlyBreakdown: [],
      totalDeductionPence: 15321,
      totalEarningsPence: 250000,
      earningsByPlatform: [{ platform: "uber", totalPence: 250000 }],
      generatedAt: new Date().toISOString(),
      userName: "Sam Driver",
    } as never);
    vi.mocked(fetchExpenseSummary).mockResolvedValue({
      categories: [{ category: "parking", label: "Parking", totalPence: 1200, deductibleWithMileage: true }],
      totalAllowablePence: 1200,
      totalNonAllowablePence: 0,
    });
    app = await createTestApp();
  });

  // ── Accept ────────────────────────────────────────────────────────────

  it("accepts a pending invite: creates access by hash, marks the invite accepted", async () => {
    accessIs(null);
    invitesAre({ any: pendingInvite, pending: pendingInvite });

    const res = await app.inject({ method: "POST", url: `/accountant/accept/${TOKEN}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.accepted).toBe(true);
    const expiresAt = new Date(res.json().data.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now() + 360 * DAY);

    const upsert = vi.mocked(prisma.accountantAccess.upsert).mock.calls[0][0];
    expect(upsert.create.tokenHash).toBe(TOKEN_HASH);
    // The real token is never written to the legacy plaintext column.
    expect(upsert.create.token).not.toBe(TOKEN);
    expect(upsert.create.token).toMatch(/^retired:/);
    expect(upsert.create.expiresAt).toBeInstanceOf(Date);
    expect(prisma.accountantInvite.update).toHaveBeenCalledWith({
      where: { id: pendingInvite.id },
      data: { status: "accepted" },
    });
    expect(logEvent).toHaveBeenCalledWith("accountant.invite_accepted", USER_ID, expect.any(Object));
  });

  it("accepting again (second visit, or a mail scanner first) is fine and changes nothing", async () => {
    accessIs(liveAccess);
    invitesAre({ accepted: { ...pendingInvite, status: "accepted" } });

    const res = await app.inject({ method: "POST", url: `/accountant/accept/${TOKEN}` });

    expect(res.statusCode).toBe(200);
    expect(prisma.accountantAccess.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("an invite not opened within 7 days says so", async () => {
    accessIs(null);
    invitesAre({ any: { ...pendingInvite, expiresAt: new Date(Date.now() - DAY) } });

    const res = await app.inject({ method: "POST", url: `/accountant/accept/${TOKEN}` });

    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe("invite_expired");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("a revoked invite cannot be accepted", async () => {
    accessIs(null);
    invitesAre({ any: { ...pendingInvite, status: "revoked" } });

    const res = await app.inject({ method: "POST", url: `/accountant/accept/${TOKEN}` });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("revoked");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("anything that is not a 128-hex token is 'not recognised', with no database lookup", async () => {
    const res = await app.inject({ method: "POST", url: `/accountant/accept/retired:abc` });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("not_found");
    expect(prisma.accountantAccess.findFirst).not.toHaveBeenCalled();
  });

  it("the old verify route sends the accountant to the website, not the API host", async () => {
    const res = await app.inject({ method: "GET", url: `/accountant/verify/${TOKEN}` });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`https://mileclear.com/accountant/${TOKEN}`);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── Dashboard ─────────────────────────────────────────────────────────

  it("returns the shape the page reads, business figures only", async () => {
    accessIs(liveAccess);
    invitesAre({ accepted: { ...pendingInvite, status: "accepted" } });

    const res = await app.inject({ method: "GET", url: `/accountant/dashboard/${TOKEN}?taxYear=2025-26` });

    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.client).toEqual({ name: "Sam Driver", email: "sam@example.com" });
    expect(d.taxYear).toBe("2025-26");
    expect(d.availableTaxYears).toContain("2025-26");
    expect(typeof d.accessExpiresAt).toBe("string");
    expect(d.summary).toEqual({
      businessTrips: 12,
      businessMiles: 340.46,
      unsortedTrips: 4,
      unsortedMiles: 51,
      mileageDeductionPence: 15321,
      vehicles: [{ name: "Toyota Prius", vehicleType: "car", businessMiles: 340.46, deductionPence: 15321 }],
      earningsTotalPence: 250000,
      earningsByPlatform: [{ platform: "uber", totalPence: 250000 }],
    });
    // No personal figure is sent at all.
    expect(JSON.stringify(d.summary)).not.toMatch(/personal|totalMiles|900|951|1291/i);
    expect(d.expenses.totalAllowablePence).toBe(1200);
    expect(Array.isArray(d.trips)).toBe(true);

    // The listed trips are business only and inside the chosen year.
    const where = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.classification).toBe("business");
    expect(where.isPhantomTrip).toBe(false);
    const startedAt = where.startedAt as { gte: Date; lte: Date };
    expect(startedAt.gte.getFullYear()).toBe(2025);
    expect(startedAt.lte.getFullYear()).toBe(2026);

    expect(logEvent).toHaveBeenCalledWith(
      "accountant.dashboard_viewed",
      USER_ID,
      expect.objectContaining({ accessId: liveAccess.id, taxYear: "2025-26" }),
    );
  });

  it("honours the tax year picker", async () => {
    accessIs(liveAccess);
    invitesAre({ accepted: { ...pendingInvite, status: "accepted" } });

    const res = await app.inject({ method: "GET", url: `/accountant/dashboard/${TOKEN}?taxYear=2024-25` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.taxYear).toBe("2024-25");
    expect(fetchExportSummary).toHaveBeenCalledWith(USER_ID, "2024-25");
    expect(fetchExpenseSummary).toHaveBeenCalledWith(USER_ID, "2024-25");
  });

  it("refuses a malformed tax year rather than throwing", async () => {
    const res = await app.inject({ method: "GET", url: `/accountant/dashboard/${TOKEN}?taxYear=2024-26` });
    expect(res.statusCode).toBe(400);
  });

  it("revoked access says it was removed", async () => {
    // Revoking deletes the access row and marks the invite revoked.
    accessIs(null);
    invitesAre({ any: { ...pendingInvite, status: "revoked" } });

    const res = await app.inject({ method: "GET", url: `/accountant/dashboard/${TOKEN}` });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("revoked");
    expect(fetchExportSummary).not.toHaveBeenCalled();
  });

  it("revoked access is refused even if the access row survived", async () => {
    accessIs(liveAccess);
    invitesAre({ accepted: null });

    const res = await app.inject({ method: "GET", url: `/accountant/dashboard/${TOKEN}` });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("revoked");
  });

  it("access past its 12 months says it has ended", async () => {
    accessIs({ ...liveAccess, expiresAt: new Date(Date.now() - DAY) });
    invitesAre({ accepted: { ...pendingInvite, status: "accepted" } });

    const res = await app.inject({ method: "GET", url: `/accountant/dashboard/${TOKEN}` });

    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe("expired");
    expect(fetchExportSummary).not.toHaveBeenCalled();
  });

  it("an access row with no expiry date fails closed as ended", async () => {
    accessIs({ ...liveAccess, expiresAt: null });

    const res = await app.inject({ method: "GET", url: `/accountant/dashboard/${TOKEN}` });

    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe("expired");
  });

  it("an unknown link is 'not recognised'", async () => {
    accessIs(null);
    invitesAre({});

    const res = await app.inject({ method: "GET", url: `/accountant/dashboard/${TOKEN}` });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("not_found");
  });

  // ── Export ────────────────────────────────────────────────────────────

  it("export is business only, for the chosen year, and logged", async () => {
    accessIs(liveAccess);
    invitesAre({ accepted: { ...pendingInvite, status: "accepted" } });

    const res = await app.inject({
      method: "GET",
      url: `/accountant/export/${TOKEN}?format=csv&taxYear=2025-26`,
    });

    expect(res.statusCode).toBe(200);
    expect(generateTripsCsv).toHaveBeenCalledWith(USER_ID, { taxYear: "2025-26", classification: "business" });
    expect(logEvent).toHaveBeenCalledWith(
      "accountant.export_downloaded",
      USER_ID,
      expect.objectContaining({ format: "csv", taxYear: "2025-26" }),
    );
  });

  it("export is refused once access has been revoked", async () => {
    accessIs(null);
    invitesAre({ any: { ...pendingInvite, status: "revoked" } });

    const res = await app.inject({
      method: "GET",
      url: `/accountant/export/${TOKEN}?format=pdf&taxYear=2025-26`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("revoked");
  });
});
