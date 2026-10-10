/**
 * The payment plan's "Put by each week" includes the accountant's fee
 * (Tax tab, decision C), by the same rule as the snapshot's weekly set-aside.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    vehicle: { findMany: vi.fn() },
    trip: { findMany: vi.fn() },
    earning: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
}));
vi.mock("../../services/export-data.js", () => ({ fetchExpenseSummary: vi.fn() }));

import { prisma } from "../../lib/prisma.js";
import { fetchExpenseSummary } from "../../services/export-data.js";
import { loadTaxPlan } from "../../services/taxPlanner.js";

function user(fee: number | null) {
  return {
    createdAt: new Date("2024-01-01T00:00:00Z"),
    workType: "gig",
    dashboardMode: "work",
    employerMileageRatePence: null,
    employerMileageRatePenceAfter10k: null,
    otherAnnualIncomePence: null,
    payeAnnualPaidTaxPence: null,
    taxBasis: "cash",
    accountantAnnualFeePence: fee,
    pushPrefs: null,
    // A bill entered for last year, so the next payment is known.
    taxPlanner: { firstSelfEmployedTaxYear: "earlier", bills: { "2025-26": 300_000 } },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchExpenseSummary).mockResolvedValue({ totalAllowablePence: 0 } as never);
  vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.earning.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
});

describe("loadTaxPlan accountant fee", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("adds the weekly fee to the weekly set-aside and reports both parts", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user(null) as never);
    const without = await loadTaxPlan("u", now);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user(52_000) as never);
    const withFee = await loadTaxPlan("u", now);

    expect(without!.weeklySetAsidePence).not.toBeNull();
    expect(without!.accountantWeeklyFeePence).toBe(0);
    expect(withFee!.accountantWeeklyFeePence).toBe(1000);
    expect(withFee!.weeklySetAsidePence).toBe(without!.weeklySetAsidePence! + 1000);
    expect(withFee!.weeklyTaxPence).toBe(without!.weeklySetAsidePence);
  });

  it("an unknown weekly figure stays unknown whatever the fee", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      { ...user(52_000), taxPlanner: null } as never
    );
    const plan = await loadTaxPlan("u", now);
    if (plan!.weeklyTaxPence == null) expect(plan!.weeklySetAsidePence).toBeNull();
  });
});
