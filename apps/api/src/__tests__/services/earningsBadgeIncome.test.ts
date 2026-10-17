/**
 * Earnings badges count earnings plus paid invoices, leaving out an earning
 * linked to a paid invoice, by the same rule as the Tax tab
 * (lib/countedIncome). Laura's data (17 Oct 2026): 9 earnings £570, 7 of them
 * (£400) linked to a paid invoice; invoices 7 paid £2,180 and 3 sent £433.50.
 * Prisma is mocked: nothing touches a database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    achievement: { findMany: vi.fn(), createMany: vi.fn() },
    trip: { count: vi.fn(), aggregate: vi.fn() },
    shift: { count: vi.fn() },
    earning: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../lib/prisma.js";
import { checkAndAwardAchievements, loadBadgeIncomePence } from "../../services/gamification.js";
import { countIncome, countedInvoiceWhere } from "../../lib/countedIncome.js";

const db = prisma as unknown as {
  achievement: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  trip: { count: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
  shift: { count: ReturnType<typeof vi.fn> };
  earning: { findMany: ReturnType<typeof vi.fn> };
  invoice: { findMany: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

const USER = "user-1";

// Seven paid invoices totalling £2,180; the first covers the 7 linked earnings.
const PAID = [
  { id: "inv-1", amountPence: 40000 },
  { id: "inv-2", amountPence: 30000 },
  { id: "inv-3", amountPence: 30000 },
  { id: "inv-4", amountPence: 30000 },
  { id: "inv-5", amountPence: 30000 },
  { id: "inv-6", amountPence: 30000 },
  { id: "inv-7", amountPence: 28000 },
];
// Seven £57.14ish earnings linked to inv-1 (£400 total), two unlinked (£170).
const LINKED = [5714, 5714, 5714, 5714, 5714, 5714, 5716].map((amountPence) => ({
  amountPence,
  replacedByInvoiceId: "inv-1",
}));
const UNLINKED = [
  { amountPence: 10000, replacedByInvoiceId: null },
  { amountPence: 7000, replacedByInvoiceId: null },
];
const LAURA_EARNINGS = [...LINKED, ...UNLINKED];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("countIncome (the shared rule)", () => {
  it("leaves out earnings linked to a counted invoice and adds the invoices", () => {
    const r = countIncome(LAURA_EARNINGS, PAID);
    expect(r.earningsPence).toBe(17000);
    expect(r.invoicePence).toBe(218000);
    expect(r.totalPence).toBe(235000);
    expect(r.dedupedEarningCount).toBe(7);
  });

  it("keeps an earning linked to an invoice that is not counted (still unpaid)", () => {
    const r = countIncome(LAURA_EARNINGS, PAID.filter((i) => i.id !== "inv-1"));
    expect(r.earningsPence).toBe(57000);
    expect(r.dedupedEarningCount).toBe(0);
  });
});

describe("countedInvoiceWhere", () => {
  it("badges and cash basis: paid and not written off", () => {
    expect(countedInvoiceWhere(USER, "cash")).toEqual({
      userId: USER,
      status: { not: "written_off" },
      paidAt: { not: null },
    });
  });
  it("Tax tab cash basis: paid inside the tax year", () => {
    const start = new Date("2026-04-06");
    const end = new Date("2027-04-05");
    expect(countedInvoiceWhere(USER, "cash", { start, end })).toEqual({
      userId: USER,
      status: { not: "written_off" },
      paidAt: { gte: start, lte: end },
    });
  });
  it("accruals basis: sent inside the tax year", () => {
    const start = new Date("2026-04-06");
    const end = new Date("2027-04-05");
    expect(countedInvoiceWhere(USER, "accruals", { start, end })).toEqual({
      userId: USER,
      status: { not: "written_off" },
      sentAt: { gte: start, lte: end },
    });
  });
});

describe("loadBadgeIncomePence", () => {
  it("asks only for paid invoices, so sent and overdue ones never count", async () => {
    db.earning.findMany.mockResolvedValue(LAURA_EARNINGS);
    db.invoice.findMany.mockResolvedValue(PAID);
    expect(await loadBadgeIncomePence(USER)).toBe(235000);
    expect(db.invoice.findMany.mock.calls[0][0].where).toEqual(countedInvoiceWhere(USER, "cash"));
    expect(db.earning.findMany.mock.calls[0][0].where).toEqual({ userId: USER });
  });

  it("earnings alone when there are no paid invoices", async () => {
    db.earning.findMany.mockResolvedValue(LAURA_EARNINGS);
    db.invoice.findMany.mockResolvedValue([]);
    expect(await loadBadgeIncomePence(USER)).toBe(57000);
  });
});

describe("checkAndAwardAchievements earnings badges", () => {
  function stats(existing: string[]) {
    db.achievement.findMany
      .mockResolvedValueOnce(existing.map((type) => ({ type })))
      .mockImplementation(async (args: { where: { type: { in: string[] } } }) =>
        args.where.type.in.map((type) => ({ id: type, type, achievedAt: new Date() }))
      );
    db.trip.count.mockResolvedValue(1);
    db.shift.count.mockResolvedValue(0);
    db.trip.aggregate.mockResolvedValue({ _sum: { distanceMiles: 1 } });
    db.$queryRaw.mockResolvedValue([]);
    db.achievement.createMany.mockResolvedValue({ count: 1 });
  }

  it("Laura gets the £1,000 badge from paid invoices, not the £5,000 one", async () => {
    stats(["first_trip", "earned_100", "earned_500"]);
    db.earning.findMany.mockResolvedValue(LAURA_EARNINGS);
    db.invoice.findMany.mockResolvedValue(PAID);
    const fresh = await checkAndAwardAchievements(USER);
    const types = fresh.map((a) => a.type);
    expect(types).toContain("earned_1000");
    expect(types).not.toContain("earned_5000");
  });

  it("linked earnings are not counted twice: £570 of earnings alone is not £1,000", async () => {
    stats(["first_trip", "earned_100", "earned_500"]);
    db.earning.findMany.mockResolvedValue(LAURA_EARNINGS);
    db.invoice.findMany.mockResolvedValue([]);
    const fresh = await checkAndAwardAchievements(USER);
    expect(fresh.map((a) => a.type)).not.toContain("earned_1000");
  });
});
