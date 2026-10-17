/**
 * Earnings badges count earnings plus paid invoices, leaving out an earning
 * linked to a paid invoice, by the same rule as the Tax tab
 * (lib/countedIncome). Laura's data (17 Oct 2026): 9 earnings £570, 7 of them
 * (£400) linked to a paid invoice; invoices 7 paid £2,180 and 3 sent £433.50.
 *
 * The badge total is three database sums. Here the sums run over in-memory
 * rows (a small evaluator for the exact where shapes used), so the test proves
 * the sums equal countIncome on the same rows. Nothing touches a database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    achievement: { findMany: vi.fn(), create: vi.fn() },
    trip: { count: vi.fn(), aggregate: vi.fn() },
    shift: { count: vi.fn() },
    earning: { aggregate: vi.fn() },
    invoice: { aggregate: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../lib/prisma.js";
import { checkAndAwardAchievements, loadBadgeIncomePence } from "../../services/gamification.js";
import {
  countIncome,
  countedInvoiceWhere,
  earningsLinkedToCountedWhere,
  incomeFromSums,
} from "../../lib/countedIncome.js";

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  achievement: { findMany: Fn; create: Fn };
  trip: { count: Fn; aggregate: Fn };
  shift: { count: Fn };
  earning: { aggregate: Fn };
  invoice: { aggregate: Fn };
  $queryRaw: Fn;
};

const USER = "user-1";
const OTHER = "user-2";

interface InvoiceRow {
  id: string;
  userId: string;
  amountPence: number;
  status: string;
  paidAt: Date | null;
  sentAt: Date;
}
interface EarningRow {
  userId: string;
  amountPence: number;
  replacedByInvoiceId: string | null;
}

const sent = new Date("2026-08-01");
const paid = new Date("2026-08-20");
const inv = (id: string, amountPence: number, over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id,
  userId: USER,
  amountPence,
  status: "paid",
  paidAt: paid,
  sentAt: sent,
  ...over,
});

// Laura: seven paid invoices totalling £2,180 (inv-1 covers the 7 linked
// earnings) and three sent ones totalling £433.50.
const LAURA_INVOICES: InvoiceRow[] = [
  inv("inv-1", 40000),
  inv("inv-2", 30000),
  inv("inv-3", 30000),
  inv("inv-4", 30000),
  inv("inv-5", 30000),
  inv("inv-6", 30000),
  inv("inv-7", 28000),
  inv("inv-8", 20000, { status: "sent", paidAt: null }),
  inv("inv-9", 15000, { status: "overdue", paidAt: null }),
  inv("inv-10", 8350, { status: "sent", paidAt: null }),
];
const LAURA_EARNINGS: EarningRow[] = [
  ...[5714, 5714, 5714, 5714, 5714, 5714, 5716].map((amountPence) => ({
    userId: USER,
    amountPence,
    replacedByInvoiceId: "inv-1",
  })),
  { userId: USER, amountPence: 10000, replacedByInvoiceId: null },
  { userId: USER, amountPence: 7000, replacedByInvoiceId: null },
];

// Awkward cases: an earning linked to an unpaid invoice (still counts), a
// written-off invoice that once had a paid date (never counts, nor does the
// earning linked to it get left out), and another driver's rows.
const EDGE_INVOICES: InvoiceRow[] = [
  ...LAURA_INVOICES,
  inv("inv-wo", 50000, { status: "written_off", paidAt: paid }),
  inv("inv-other", 99900, { userId: OTHER }),
];
const EDGE_EARNINGS: EarningRow[] = [
  ...LAURA_EARNINGS,
  { userId: USER, amountPence: 2000, replacedByInvoiceId: "inv-8" },
  { userId: USER, amountPence: 3000, replacedByInvoiceId: "inv-wo" },
  { userId: OTHER, amountPence: 77700, replacedByInvoiceId: "inv-other" },
  { userId: OTHER, amountPence: 1000, replacedByInvoiceId: null },
];

// ── in-memory sums for the where shapes countedIncome builds ──
type Range = { gte?: Date; lte?: Date; not?: null };
function inRange(v: Date | null, r: Range | undefined): boolean {
  if (r === undefined) return true;
  if ("not" in r) return v !== null;
  if (v === null) return false;
  return (!r.gte || v >= r.gte) && (!r.lte || v <= r.lte);
}
function invoiceMatches(row: InvoiceRow, where: Record<string, unknown>): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  const status = where.status as { not?: string } | undefined;
  if (status?.not !== undefined && row.status === status.not) return false;
  if (!inRange(row.paidAt, where.paidAt as Range | undefined)) return false;
  if (!inRange(row.sentAt, where.sentAt as Range | undefined)) return false;
  return true;
}
function useRows(invoices: InvoiceRow[], earnings: EarningRow[]) {
  db.invoice.aggregate.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const rows = invoices.filter((r) => invoiceMatches(r, where));
    return { _sum: { amountPence: rows.length ? rows.reduce((s, r) => s + r.amountPence, 0) : null } };
  });
  db.earning.aggregate.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const link = where.replacedByInvoice as { is: Record<string, unknown> } | undefined;
    const rows = earnings.filter((e) => {
      if (e.userId !== where.userId) return false;
      if (!link) return true;
      const invoice = invoices.find((i) => i.id === e.replacedByInvoiceId);
      return !!invoice && invoiceMatches(invoice, link.is);
    });
    return { _sum: { amountPence: rows.length ? rows.reduce((s, r) => s + r.amountPence, 0) : null } };
  });
}

/** The rule written out directly: cash basis, all time, this driver only. */
function expectedByCountIncome(invoices: InvoiceRow[], earnings: EarningRow[]): number {
  const counted = invoices.filter((i) => i.userId === USER && i.status !== "written_off" && i.paidAt !== null);
  return countIncome(
    earnings.filter((e) => e.userId === USER),
    counted
  ).totalPence;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("countIncome (the shared rule)", () => {
  const counted = LAURA_INVOICES.filter((i) => i.paidAt !== null);
  it("leaves out earnings linked to a counted invoice and adds the invoices", () => {
    const r = countIncome(LAURA_EARNINGS, counted);
    expect(r.earningsPence).toBe(17000);
    expect(r.invoicePence).toBe(218000);
    expect(r.totalPence).toBe(235000);
    expect(r.dedupedEarningCount).toBe(7);
  });

  it("keeps an earning linked to an invoice that is not counted (still unpaid)", () => {
    const r = countIncome(LAURA_EARNINGS, counted.filter((i) => i.id !== "inv-1"));
    expect(r.earningsPence).toBe(57000);
    expect(r.dedupedEarningCount).toBe(0);
  });

  it("incomeFromSums is the same arithmetic", () => {
    expect(incomeFromSums({ allEarningsPence: 57000, linkedEarningsPence: 40000, invoicePence: 218000 })).toBe(235000);
  });
});

describe("where clauses", () => {
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
  it("linked earnings: this driver's, pointing at a counted invoice", () => {
    expect(earningsLinkedToCountedWhere(USER, "cash")).toEqual({
      userId: USER,
      replacedByInvoice: { is: countedInvoiceWhere(USER, "cash") },
    });
  });
});

describe("loadBadgeIncomePence equals countIncome on the same rows", () => {
  it("Laura: £2,350", async () => {
    useRows(LAURA_INVOICES, LAURA_EARNINGS);
    const got = await loadBadgeIncomePence(USER);
    expect(got).toBe(235000);
    expect(got).toBe(expectedByCountIncome(LAURA_INVOICES, LAURA_EARNINGS));
  });

  it("unpaid links, written-off invoices and other drivers' rows", async () => {
    useRows(EDGE_INVOICES, EDGE_EARNINGS);
    const got = await loadBadgeIncomePence(USER);
    expect(got).toBe(expectedByCountIncome(EDGE_INVOICES, EDGE_EARNINGS));
    // £570 + £20 + £30 earnings, less £400 linked to inv-1, plus £2,180 paid.
    expect(got).toBe(240000);
  });

  it("no paid invoices: earnings alone", async () => {
    const unpaid = LAURA_INVOICES.map((i) => ({ ...i, status: "sent", paidAt: null }));
    useRows(unpaid, LAURA_EARNINGS);
    expect(await loadBadgeIncomePence(USER)).toBe(57000);
    expect(expectedByCountIncome(unpaid, LAURA_EARNINGS)).toBe(57000);
  });

  it("nothing at all is zero, not NaN", async () => {
    useRows([], []);
    expect(await loadBadgeIncomePence(USER)).toBe(0);
  });
});

describe("checkAndAwardAchievements earnings badges", () => {
  /** A badges table with the (userId, type) unique key. */
  function badgeTable(existing: string[]) {
    const rows = new Set(existing);
    db.achievement.findMany.mockImplementation(async () => [...rows].map((type) => ({ type })));
    db.achievement.create.mockImplementation(async ({ data }: { data: { type: string } }) => {
      await Promise.resolve();
      if (rows.has(data.type)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
      rows.add(data.type);
      return { id: data.type, type: data.type, achievedAt: new Date() };
    });
    db.trip.count.mockResolvedValue(1);
    db.shift.count.mockResolvedValue(0);
    db.trip.aggregate.mockResolvedValue({ _sum: { distanceMiles: 1 } });
    db.$queryRaw.mockResolvedValue([]);
  }

  it("Laura gets the £1,000 badge from paid invoices, not the £5,000 one", async () => {
    badgeTable(["first_trip", "earned_100", "earned_500"]);
    useRows(LAURA_INVOICES, LAURA_EARNINGS);
    const types = (await checkAndAwardAchievements(USER)).map((a) => a.type);
    expect(types).toEqual(["earned_1000"]);
  });

  it("linked earnings are not counted twice: £570 of earnings alone is not £1,000", async () => {
    badgeTable(["first_trip", "earned_100", "earned_500"]);
    useRows(
      LAURA_INVOICES.map((i) => ({ ...i, status: "sent", paidAt: null })),
      LAURA_EARNINGS
    );
    expect(await checkAndAwardAchievements(USER)).toEqual([]);
  });

  it("two checks at once return the new badge once between them, so one push", async () => {
    badgeTable(["first_trip", "earned_100", "earned_500"]);
    useRows(LAURA_INVOICES, LAURA_EARNINGS);
    const [a, b] = await Promise.all([checkAndAwardAchievements(USER), checkAndAwardAchievements(USER)]);
    const all = [...a, ...b].map((x) => x.type);
    expect(all).toEqual(["earned_1000"]);
  });

  it("a database error other than a duplicate still fails the check", async () => {
    badgeTable(["first_trip"]);
    useRows([], []);
    db.trip.count.mockResolvedValue(10);
    db.achievement.create.mockRejectedValue(Object.assign(new Error("down"), { code: "P1001" }));
    await expect(checkAndAwardAchievements(USER)).rejects.toThrow("down");
  });
});
