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

function setup(opts: { earningsPence: number; otherIncomePence: number | null }) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    fullName: "A",
    workType: "gig",
    employerMileageRatePence: null,
    employerMileageRatePenceAfter10k: null,
    otherAnnualIncomePence: opts.otherIncomePence,
    payeAnnualPaidTaxPence: null,
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

describe("now parameter", () => {
  it("builds the snapshot for the date it is given", async () => {
    setup({ earningsPence: 100_000, otherIncomePence: null });
    expect((await buildTaxSnapshot("u", new Date("2027-02-15T12:00:00Z"))).taxYear).toBe("2026-27");
    expect((await buildTaxSnapshot("u", new Date("2027-04-10T12:00:00Z"))).taxYear).toBe("2027-28");
  });
});
