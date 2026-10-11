/** buildTaxSnapshot: the `now` parameter and the higher-rate headroom (Tax tab, 10 Oct 2026). */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    vehicle: { findMany: vi.fn() },
    trip: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    earning: { findMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
}));
vi.mock("../../services/export-data.js", () => ({ fetchExpenseSummary: vi.fn() }));

import { prisma } from "../../lib/prisma.js";
import { fetchExpenseSummary } from "../../services/export-data.js";
import { buildTaxSnapshot } from "../../services/taxSnapshot.js";

const NOW = new Date("2026-10-10T12:00:00Z");

function setup(opts: { earningsPence: number; otherIncomePence: number | null; scottishTaxpayer?: boolean | null }) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    fullName: "A",
    workType: "gig",
    employerMileageRatePence: null,
    employerMileageRatePenceAfter10k: null,
    otherAnnualIncomePence: opts.otherIncomePence,
    payeAnnualPaidTaxPence: null,
    scottishTaxpayer: opts.scottishTaxpayer ?? null,
    taxBasis: "cash",
    accountantAnnualFeePence: null,
  } as never);
  vi.mocked(prisma.earning.findMany).mockResolvedValue(
    [{ id: "e1", amountPence: opts.earningsPence, periodStart: new Date("2026-06-01"), platform: "uber", replacedByInvoiceId: null }] as never
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchExpenseSummary).mockResolvedValue({ totalAllowablePence: 0 } as never);
  vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.trip.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.trip.aggregate).mockResolvedValue({ _sum: { distanceMiles: 0 } } as never);
  vi.mocked(prisma.earning.aggregate).mockResolvedValue({ _sum: { amountPence: 0 } } as never);
  vi.mocked(prisma.earning.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
});

describe("higherRateHeadroomPence", () => {
  it("is the gap to the 50,270 threshold when profit plus other income is within 15,000 of it", async () => {
    setup({ earningsPence: 1_000_000, otherIncomePence: 3_500_000 }); // 10,000 + 35,000
    const s = await buildTaxSnapshot("u", NOW);
    expect(s.ytd.higherRateHeadroomPence).toBe(5_027_000 - 4_500_000);
  });

  it("is null when far below the threshold", async () => {
    setup({ earningsPence: 500_000, otherIncomePence: null });
    expect((await buildTaxSnapshot("u", NOW)).ytd.higherRateHeadroomPence).toBeNull();
  });

  it("is null once over the threshold", async () => {
    setup({ earningsPence: 3_000_000, otherIncomePence: 3_000_000 });
    expect((await buildTaxSnapshot("u", NOW)).ytd.higherRateHeadroomPence).toBeNull();
  });
});

describe("Scottish taxpayer", () => {
  it("measures headroom to Scotland's 42% rate at 43,662", async () => {
    setup({ earningsPence: 4_000_000, otherIncomePence: null, scottishTaxpayer: true });
    const s = await buildTaxSnapshot("u", NOW);
    expect(s.ytd.higherRateHeadroomPence).toBe(4_366_200 - 4_000_000);
    expect(s.ytd.higherRatePct).toBe(42);
    expect(s.ytd.scottishTaxpayer).toBe(true);
  });

  it("uses the Scottish bands for the estimate (2026-27, 30,000 profit)", async () => {
    setup({ earningsPence: 3_000_000, otherIncomePence: null, scottishTaxpayer: true });
    const s = await buildTaxSnapshot("u", NOW);
    // Income Tax 3,451.07 (see shared incomeTax.test.ts) + Class 4 17,430 x 6% = 1,045.80
    expect(s.ytd.grossTaxLiabilityPence).toBe(345_107 + 104_580);
  });

  it("not answered is the rest of the UK", async () => {
    setup({ earningsPence: 3_000_000, otherIncomePence: null, scottishTaxpayer: null });
    const s = await buildTaxSnapshot("u", NOW);
    expect(s.ytd.grossTaxLiabilityPence).toBe(348_600 + 104_580);
    expect(s.ytd.higherRatePct).toBe(40);
  });
});

describe("now parameter", () => {
  it("builds the snapshot for the date it is given", async () => {
    setup({ earningsPence: 100_000, otherIncomePence: null });
    expect((await buildTaxSnapshot("u", new Date("2027-02-15T12:00:00Z"))).taxYear).toBe("2026-27");
    expect((await buildTaxSnapshot("u", new Date("2027-04-10T12:00:00Z"))).taxYear).toBe("2027-28");
  });
});
