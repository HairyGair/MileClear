/**
 * GET /tax/overview (Tax tab, 10 Oct 2026). The overview wraps existing
 * services and does no maths of its own, so these tests pin the AGREEMENT
 * RULES (SPEC 6.4): every figure on the Tax tab is the figure the owning
 * service returns, and so can never disagree with Home, Insights, the
 * checklist or the Self Assessment wizard. Prisma and the sub-services are
 * mocked: nothing touches a database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    orgMembership: { findFirst: vi.fn() },
    trip: { findFirst: vi.fn() },
    mileageSummary: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/saChecklist.js", () => ({ loadSaChecklist: vi.fn() }));
vi.mock("../../services/taxSnapshot.js", () => ({ buildTaxSnapshot: vi.fn() }));
vi.mock("../../services/taxPlanner.js", () => ({ loadTaxPlan: vi.fn() }));
vi.mock("../../services/mileageRelief.js", () => ({ loadMileageReliefData: vi.fn() }));
vi.mock("../../services/proEntitlement.js", () => ({ isProUser: vi.fn() }));

import { prisma } from "../../lib/prisma.js";
import { loadSaChecklist } from "../../services/saChecklist.js";
import { buildTaxSnapshot } from "../../services/taxSnapshot.js";
import { loadTaxPlan } from "../../services/taxPlanner.js";
import { loadMileageReliefData } from "../../services/mileageRelief.js";
import { isProUser } from "../../services/proEntitlement.js";
import { loadTaxOverview } from "../../services/taxOverview.js";
import { taxRoutes } from "../../routes/tax/index.js";

const USER = "00000000-0000-0000-0000-0000000000a1";
const OCT = new Date("2026-10-10T12:00:00Z");
const FEB = new Date("2027-02-15T12:00:00Z");

const payment = (amountPence: number | null) => ({
  dueDate: "2027-01-31",
  daysAway: 113,
  amountPence,
  parts: [],
  firstPaymentOnAccount: false,
});

const item = (id: string, status: "attention" | "done" | "optional") => ({
  id,
  status,
  title: id,
  detail: "d",
  action: null,
  actionLabel: null,
});

function checklist(over: Record<string, unknown> = {}) {
  return {
    taxYear: "2025-26",
    deadline: "2027-01-31T23:59:59.000Z",
    daysToDeadline: 113,
    attentionCount: 2,
    headline: "2 things to sort before 31 January",
    businessMiles: 3000,
    mileageClaimPence: 135_000,
    earningsPence: 900_000,
    items: [item("trips_sorted", "attention"), item("earnings", "done"), item("full_name", "attention"), item("pdf", "optional")],
    ...over,
  };
}

function snapshot(over: Record<string, unknown> = {}) {
  return {
    taxYear: "2026-27",
    ytd: {
      estimatedTaxPence: 123_456,
      grossEarningsPence: 600_000,
      mileageDeductionPence: 17_138,
      allowableExpensesPence: 5000,
      higherRateHeadroomPence: 250_000,
      mileageDeductionDerivation: { label: "m" },
      earningsDerivation: { label: "e" },
    },
    ...over,
  };
}

function plan(over: Record<string, unknown> = {}) {
  return {
    currentTaxYear: "2026-27",
    payments: [payment(0), payment(189_000)],
    weeklySetAsidePence: 5800,
    accountantWeeklyFeePence: 1000,
    coversTo: "2027-01-31",
    missingCurrentEarnings: false,
    startAssumed: false,
    settings: { firstSelfEmployedTaxYear: "earlier", bills: {} },
    ...over,
  };
}

const relief = { workType: "both", years: [] };

function setUser(workType: string, member = false) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ workType } as never);
  vi.mocked(prisma.orgMembership.findFirst).mockResolvedValue((member ? { id: "m1" } : null) as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.trip.findFirst).mockResolvedValue({ id: "t1" } as never);
  vi.mocked(isProUser).mockResolvedValue(false);
  vi.mocked(prisma.mileageSummary.findUnique).mockResolvedValue({
    totalMiles: 4200.4,
    businessMiles: 3100.2,
    deductionPence: 99_999,
  } as never);
  vi.mocked(loadSaChecklist).mockResolvedValue(checklist() as never);
  vi.mocked(buildTaxSnapshot).mockResolvedValue(snapshot() as never);
  vi.mocked(loadTaxPlan).mockResolvedValue(plan() as never);
  vi.mocked(loadMileageReliefData).mockResolvedValue(relief as never);
});

describe("agreement rules (SPEC 6.4)", () => {
  it("claim is the MileageSummary row /gamification/stats reads, for the same tax year", async () => {
    setUser("gig");
    const o = await loadTaxOverview(USER, { now: OCT });
    // getStats() calls the same findUnique with getTaxYear(now).
    expect(prisma.mileageSummary.findUnique).toHaveBeenCalledWith({
      where: { userId_taxYear: { userId: USER, taxYear: "2026-27" } },
    });
    expect(o!.claim).toEqual({ taxYear: "2026-27", totalMiles: 4200.4, businessMiles: 3100.2, claimPence: 99_999 });
  });

  it("thisYear.returnMileagePence is the tax snapshot's ytd.mileageDeductionPence", async () => {
    setUser("gig");
    const o = await loadTaxOverview(USER, { now: OCT });
    expect(o!.thisYear!.returnMileagePence).toBe(17_138);
    expect(o!.thisYear!.estimatedTaxPence).toBe(123_456);
    expect(o!.thisYear!.higherRateHeadroomPence).toBe(250_000);
    expect(buildTaxSnapshot).toHaveBeenCalledWith(USER, OCT);
  });

  it("return.returnMileagePence is the checklist's mileageClaimPence", async () => {
    setUser("both");
    const o = await loadTaxOverview(USER, { now: OCT });
    expect(o!.return!.returnMileagePence).toBe(135_000);
    expect(o!.return!.taxYear).toBe("2025-26");
    expect(loadSaChecklist).toHaveBeenCalledWith(USER, { now: OCT });
  });

  it("plan.weeklySetAsidePence is the payment plan's figure, not a recalculation", async () => {
    setUser("gig");
    const o = await loadTaxOverview(USER, { now: OCT });
    expect(o!.plan!.weeklySetAsidePence).toBe(5800);
    expect(o!.plan!.accountantWeeklyFeePence).toBe(1000);
    expect(o!.plan!.nextPayment!.amountPence).toBe(189_000);
  });

  it("relief is the /mileage-relief data, unchanged", async () => {
    setUser("employee");
    const o = await loadTaxOverview(USER, { now: OCT });
    expect(o!.relief).toBe(relief);
  });

  it("attention items are the checklist's, in order, with the PDF step left out", async () => {
    setUser("gig");
    const o = await loadTaxOverview(USER, { now: OCT });
    expect(o!.return!.attentionItems.map((i) => i.id)).toEqual(["trips_sorted", "full_name"]);
  });
});

describe("personas", () => {
  it("gig: return, thisYear and plan, no relief query", async () => {
    setUser("gig");
    const o = (await loadTaxOverview(USER, { now: OCT }))!;
    expect(o.workType).toBe("gig");
    expect(o.return).not.toBeNull();
    expect(o.thisYear).not.toBeNull();
    expect(o.plan).not.toBeNull();
    expect(o.relief).toBeNull();
    expect(loadMileageReliefData).not.toHaveBeenCalled();
  });

  it("employee: relief only, none of the self-employed sections are even queried", async () => {
    setUser("employee");
    const o = (await loadTaxOverview(USER, { now: OCT }))!;
    expect(o.return).toBeNull();
    expect(o.thisYear).toBeNull();
    expect(o.plan).toBeNull();
    expect(o.relief).not.toBeNull();
    expect(loadSaChecklist).not.toHaveBeenCalled();
    expect(buildTaxSnapshot).not.toHaveBeenCalled();
    expect(loadTaxPlan).not.toHaveBeenCalled();
  });

  it("both: every section", async () => {
    setUser("both");
    const o = (await loadTaxOverview(USER, { now: OCT }))!;
    expect(o.return && o.thisYear && o.plan && o.relief).toBeTruthy();
  });

  it("company driver: flagged, and gets the relief data", async () => {
    setUser("gig", true);
    const o = (await loadTaxOverview(USER, { now: OCT }))!;
    expect(o.isCompanyDriver).toBe(true);
    expect(o.relief).not.toBeNull();
  });

  it("an unknown work type reads as gig", async () => {
    setUser("self_employed");
    expect((await loadTaxOverview(USER, { now: OCT }))!.workType).toBe("gig");
  });

  it("reports Pro (team and partner included) from the one entitlement check", async () => {
    setUser("gig");
    vi.mocked(isProUser).mockResolvedValue(true);
    expect((await loadTaxOverview(USER, { now: OCT }))!.isPremium).toBe(true);
  });

  it("hasTrips is false with no non-phantom trip", async () => {
    setUser("gig");
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(null as never);
    expect((await loadTaxOverview(USER, { now: OCT }))!.hasTrips).toBe(false);
  });

  it("is null for an unknown user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    expect(await loadTaxOverview(USER, { now: OCT })).toBeNull();
  });
});

describe("lead", () => {
  it("is the return in October and this year in February", async () => {
    setUser("gig");
    expect((await loadTaxOverview(USER, { now: OCT }))!.lead).toBe("return");
    expect((await loadTaxOverview(USER, { now: FEB }))!.lead).toBe("this_year");
    expect((await loadTaxOverview(USER, { now: FEB }))!.today).toBe("2027-02-15");
  });

  it("a driver who started this tax year has no return and this year leads all year", async () => {
    setUser("gig");
    vi.mocked(loadTaxPlan).mockResolvedValue(
      plan({ startAssumed: false, settings: { firstSelfEmployedTaxYear: "2026-27", bills: {} } }) as never
    );
    const o = (await loadTaxOverview(USER, { now: OCT }))!;
    expect(o.return).toBeNull();
    expect(o.lead).toBe("this_year");
    expect(o.thisYear).not.toBeNull();
    expect(o.failed).toEqual([]);
  });
});

describe("failures", () => {
  it("one failed section is null and listed, the rest still answer", async () => {
    setUser("gig");
    vi.mocked(loadSaChecklist).mockRejectedValue(new Error("boom"));
    const o = (await loadTaxOverview(USER, { now: OCT }))!;
    expect(o.return).toBeNull();
    expect(o.failed).toEqual(["return"]);
    expect(o.thisYear).not.toBeNull();
    expect(o.claim).not.toBeNull();
  });

  it("a failed claim is null, not zero", async () => {
    setUser("gig");
    vi.mocked(prisma.mileageSummary.findUnique).mockRejectedValue(new Error("boom"));
    const o = (await loadTaxOverview(USER, { now: OCT }))!;
    expect(o.claim).toBeNull();
    expect(o.failed).toContain("claim");
  });

  it("no summary row reads as zero, like /gamification/stats", async () => {
    setUser("gig");
    vi.mocked(prisma.mileageSummary.findUnique).mockResolvedValue(null as never);
    const o = (await loadTaxOverview(USER, { now: OCT }))!;
    expect(o.claim).toEqual({ taxYear: "2026-27", totalMiles: 0, businessMiles: 0, claimPence: 0 });
  });
});

describe("cache", () => {
  it("serves a second request from the 30 second cache, and fresh=1 skips it", async () => {
    setUser("gig");
    const id = "00000000-0000-0000-0000-0000000000c7";
    await loadTaxOverview(id);
    await loadTaxOverview(id);
    expect(buildTaxSnapshot).toHaveBeenCalledTimes(1);
    await loadTaxOverview(id, { fresh: true });
    expect(buildTaxSnapshot).toHaveBeenCalledTimes(2);
  });

  it("never caches a pinned date", async () => {
    setUser("gig");
    const id = "00000000-0000-0000-0000-0000000000c8";
    await loadTaxOverview(id, { now: FEB });
    await loadTaxOverview(id, { now: FEB });
    expect(buildTaxSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe("GET /tax/overview", () => {
  async function app() {
    const a = await buildApp();
    await a.register(taxRoutes, { prefix: "/tax" });
    return a;
  }

  it("requires auth", async () => {
    const a = await app();
    expect((await a.inject({ method: "GET", url: "/tax/overview" })).statusCode).toBe(401);
  });

  it("asOf is ignored for ordinary drivers and honoured for admins", async () => {
    setUser("gig");
    const a = await app();
    const asUser = await a.inject({
      method: "GET",
      url: "/tax/overview?asOf=2027-02-15&fresh=1",
      headers: { authorization: `Bearer ${makeAccessToken(USER)}` },
    });
    expect(asUser.statusCode).toBe(200);
    expect(asUser.json().data.lead).toBe("return"); // today is not February
    const asAdmin = await a.inject({
      method: "GET",
      url: "/tax/overview?asOf=2027-02-15",
      headers: { authorization: `Bearer ${makeAccessToken(USER, true)}` },
    });
    expect(asAdmin.json().data.lead).toBe("this_year");
    expect(asAdmin.json().data.today).toBe("2027-02-15");
  });

  it("rejects a malformed asOf for admins", async () => {
    const a = await app();
    const res = await a.inject({
      method: "GET",
      url: "/tax/overview?asOf=tomorrow",
      headers: { authorization: `Bearer ${makeAccessToken(USER, true)}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
