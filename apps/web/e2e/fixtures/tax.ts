import type { Page, Route } from "@playwright/test";
import { API } from "./api";

// Fixtures and a recording mock for the Tax pages. Register AFTER mockSession():
// the last route registered wins, and anything not handled here falls back to it.

export const SNAPSHOT_GIG = {
  taxYear: "2026-27",
  taxYearEndDate: "2027-04-05T00:00:00.000Z",
  filingDeadline: "2028-01-31T23:59:59.000Z",
  daysToFilingDeadline: 479,
  ytd: {
    grossEarningsPence: 1840000,
    gigEarningsPence: 1840000,
    invoiceIncomePence: 0,
    taxBasis: "cash",
    mileageDeductionPence: 231500,
    allowableExpensesPence: 61200,
    taxableProfitPence: 1547300,
    grossTaxLiabilityPence: 124000,
    payeAlreadyPaidPence: 0,
    estimatedTaxPence: 124000,
    effectiveRatePercent: 6.74,
    mileageDeductionDerivation: {
      summary: "Business trips this tax year at the approved mileage rates.",
      formula: "(4,210.0 mi x 55p)",
      components: [
        { label: "Business miles in tax year", value: "4,210.0 mi" },
        { label: "Car: 4,210.0 mi x 55p", value: "£2,315.50" },
        { label: "Total mileage deduction", value: "£2,315.00", highlight: true },
      ],
      sources: [{ kind: "trips", count: 188, description: "Business trips in tax year 2026-27" }],
      notes: ["Cars and vans share one 10,000 mile limit."],
    },
    mileageDeductionAcrossWindows: { windows: [] },
    earningsDerivation: {
      summary: "Gig earnings you added, counted on a cash basis.",
      components: [{ label: "Gig earnings", value: "£18,400.00", highlight: true }],
    },
    dedupedEarningCount: 0,
  },
  setAsideThisWeek: {
    earningsLast7DaysPence: 46000,
    suggestedSetAsidePence: 3100,
    rateUsedPercent: 6.74,
    taxComponentPence: 3100,
    accountantWeeklyFeePence: 0,
  },
  readiness: {
    percentComplete: 67,
    items: [
      { id: "profile-name", label: "Full name on profile", done: false, hint: "Self Assessment exports need your full legal name." },
      { id: "primary-vehicle", label: "Primary vehicle with MPG", done: true },
      { id: "trips-classified", label: "All trips classified this tax year", done: true },
    ],
  },
  nudges: { earnings: false },
};

export const SNAPSHOT_EMPLOYEE = {
  ...SNAPSHOT_GIG,
  ytd: { ...SNAPSHOT_GIG.ytd, grossEarningsPence: 0, estimatedTaxPence: 0, taxableProfitPence: 0 },
};

export const SNAPSHOT_EMPTY = {
  ...SNAPSHOT_GIG,
  ytd: {
    ...SNAPSHOT_GIG.ytd,
    grossEarningsPence: 0,
    mileageDeductionPence: 0,
    allowableExpensesPence: 0,
    taxableProfitPence: 0,
    grossTaxLiabilityPence: 0,
    estimatedTaxPence: 0,
  },
};

export const SA_SUMMARY = {
  taxYear: "2026-27",
  totalEarningsPence: 1840000,
  platformBreakdown: [
    { platform: "uber", totalPence: 1200000, count: 40 },
    { platform: "deliveroo", totalPence: 640000, count: 22 },
  ],
  totalMiles: 6000,
  businessMiles: 4210,
  personalMiles: 1790,
  mileageDeductionPence: 231500,
  vehicleBreakdown: [
    { vehicleId: "v1", make: "Ford", model: "Fiesta", vehicleType: "car", businessMiles: 3500, personalMiles: 1500, totalMiles: 5000, deductionPence: 192500 },
    { vehicleId: "v2", make: "Honda", model: "PCX", vehicleType: "motorbike", businessMiles: 710, personalMiles: 290, totalMiles: 1000, deductionPence: 17040 },
    { vehicleId: "v3", make: "Lease", model: "Van", vehicleType: "van", businessMiles: 100, personalMiles: 0, totalMiles: 100, deductionPence: 0 },
  ],
  expenseBreakdown: [{ category: "parking", label: "Parking", totalPence: 61200, deductibleWithMileage: true }],
  allowableExpensesPence: 61200,
  nonMileageExpensesPence: 0,
  taxableProfitPence: 1547300,
  taxBandBreakdown: [
    { band: "Personal Allowance", type: "income_tax", ratePct: 0, amountPence: 0, description: "First £12,570 of profit is tax-free" },
    { band: "Basic Rate", type: "income_tax", ratePct: 0.2, amountPence: 59000, description: "20% on profit between £12,570 and £50,270" },
  ],
  totalTaxPence: 124000,
  effectiveRatePercent: 6.74,
  sa103Values: {
    totalEarnings: 1840000,
    otherIncome: 0,
    carVanTravelExpenses: 292700,
    professionalFees: 0,
    officeCosts: 0,
    otherAllowableExpenses: 0,
    totalAllowableExpenses: 292700,
    netProfitTotal: 1547300,
    netLossTotal: 0,
    netBusinessProfit: 1547300,
    taxableProfit: 1547300,
  },
};

export const SA_EMPTY = {
  ...SA_SUMMARY,
  totalEarningsPence: 0,
  platformBreakdown: [],
  totalMiles: 0,
  businessMiles: 0,
  personalMiles: 0,
  mileageDeductionPence: 0,
  vehicleBreakdown: [],
  expenseBreakdown: [],
  allowableExpensesPence: 0,
  sa103Values: {},
};

export const CHECKLIST = {
  taxYear: "2026-27",
  taxYearLabel: "6 April 2026 to 5 April 2027",
  deadline: "2028-01-31T23:59:59.000Z",
  daysToDeadline: 479,
  inSeason: true,
  eligible: true,
  ineligibleReason: null,
  businessMiles: 4210,
  businessTrips: 188,
  mileageClaimPence: 231500,
  unclassifiedTrips: 2,
  unclassifiedMiles: 11,
  earningsPence: 1840000,
  earningsCount: 62,
  allowableExpensesPence: 61200,
  expenseCount: 6,
  items: [
    { id: "trips_sorted", status: "attention", title: "Sort your trips", detail: "2 trips are not marked Business or Personal.", action: "unclassified_trips", actionLabel: "Sort trips" },
    { id: "mileage_claim", status: "done", title: "Mileage claim", detail: "4,210 miles, £2,315.", action: null, actionLabel: null },
    { id: "earnings", status: "done", title: "Earnings", detail: "62 entries.", action: null, actionLabel: null },
    { id: "expenses", status: "done", title: "Expenses", detail: "6 expenses.", action: null, actionLabel: null },
    { id: "vehicles", status: "done", title: "Vehicles", detail: "1 vehicle.", action: null, actionLabel: null },
    { id: "full_name", status: "attention", title: "Your full name", detail: "Add it to your profile.", action: "profile_name", actionLabel: "Add name" },
    { id: "pdf", status: "optional", title: "Self Assessment PDF", detail: "A printable copy.", action: "sa_pdf", actionLabel: "Open Self Assessment" },
  ],
  attentionCount: 2,
  headline: "You are nearly there.",
};

export const PLAN = {
  currentTaxYear: "2026-27",
  years: [
    { taxYear: "2024-25", billPence: 90000, source: "entered", recordedEarningsPence: 0, partialYear: false },
    { taxYear: "2025-26", billPence: 150000, source: "estimate", recordedEarningsPence: 2000000, partialYear: false },
    { taxYear: "2026-27", billPence: 124000, source: "projection", recordedEarningsPence: 1840000, partialYear: false },
  ],
  payments: [
    {
      dueDate: "2027-01-31",
      daysAway: 114,
      amountPence: 225000,
      firstPaymentOnAccount: true,
      parts: [
        { kind: "balancing", taxYear: "2025-26", amountPence: 150000 },
        { kind: "poa1", taxYear: "2026-27", amountPence: 75000 },
      ],
    },
    {
      dueDate: "2027-07-31",
      daysAway: 295,
      amountPence: 75000,
      firstPaymentOnAccount: false,
      parts: [{ kind: "poa2", taxYear: "2026-27", amountPence: 75000 }],
    },
  ],
  weeklySetAsidePence: 4200,
  coversTo: "2027-07-31",
  missingCurrentEarnings: false,
  startAssumed: false,
  settings: { firstSelfEmployedTaxYear: "2025-26", bills: { "2024-25": 90000 } },
  remindersOn: true,
  mayNotApply: false,
};

export const RECON = {
  taxYear: "2026-27",
  rows: [
    { platform: "uber", label: "Uber", hmrcReportedPence: null, mileclearTrackedPence: 1200000, diffPence: null, notes: null, updatedAt: null },
    { platform: "deliveroo", label: "Deliveroo", hmrcReportedPence: null, mileclearTrackedPence: 640000, diffPence: null, notes: null, updatedAt: null },
  ],
  totals: { hmrcReportedPence: 0, mileclearTrackedPence: 1840000, diffPence: 0, completedPlatforms: 0, totalPlatforms: 2 },
};

export const MAR_DATA = {
  workType: "employee",
  employerMileageRatePence: 25,
  employerMileageRatePenceAfter10k: null,
  joinedAt: "2026-01-01T00:00:00.000Z",
  firstTripAt: "2026-04-10T00:00:00.000Z",
  years: [
    {
      taxYear: "2026-27",
      claimBy: { year: 2031, month: 4, day: 5 },
      carVanMiles: 2000,
      motorcycleMiles: 0,
      businessTrips: 40,
      commuteMilesLeftOut: 12,
      selfEmployedMilesLeftOut: 0,
      unclassifiedTrips: 0,
      unclassifiedMiles: 0,
    },
  ],
};

export interface CertSummary {
  id: string;
  code: string;
  verifyUrl: string;
  createdAt: string;
  revokedAt: string | null;
  periodStart: string;
  periodEnd: string;
  taxYear: string | null;
  purpose: string | null;
  vehicleLabel: string;
  totalMiles: number;
  trips: number;
}

export const CERT_ONE: CertSummary = {
  id: "c1",
  code: "ABCDEFGHJKLMNPQRSTUV",
  verifyUrl: "https://mileclear.com/verify/ABCDEFGHJKLMNPQRSTUV",
  createdAt: "2026-10-01T10:00:00.000Z",
  revokedAt: null,
  periodStart: "2026-04-06",
  periodEnd: "2026-09-30",
  taxYear: null,
  purpose: "insurer",
  vehicleLabel: "Ford Fiesta",
  totalMiles: 3100.4,
  trips: 120,
};

export const CERT_PREVIEW = {
  periodStart: "2026-04-06",
  periodEnd: "2026-10-09",
  taxYear: null,
  driverName: "Sam Tester",
  vehicles: [],
  singleVehicle: false,
  accountCreatedAt: "2026-01-01T00:00:00.000Z",
  totalMiles: 3100.4,
  businessMiles: 2500.2,
  personalMiles: 500.1,
  unclassifiedMiles: 100.1,
  trips: 120,
  gpsTrips: 110,
  gpsMiles: 3000,
  manualTrips: 10,
  manualMiles: 100.4,
  gpsMilesPercent: 97,
  firstTripAt: "2026-04-10T00:00:00.000Z",
  lastTripAt: "2026-10-08T00:00:00.000Z",
  months: [],
};

export interface TaxMockOptions {
  snapshot?: unknown;
  summary?: unknown;
  hmrcStatus?: unknown | null;
  vehicles?: unknown[];
  certs?: CertSummary[];
  /** Status and body for a download route, keyed by path prefix. */
  download?: Record<string, { status: number; body: string; contentType?: string }>;
  access?: unknown[];
  mar?: unknown;
}

export interface Recorded {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

/**
 * Answers the Tax endpoints from fixtures and records every request, so specs can
 * check what was sent. Anything it does not know is passed to mockSession().
 */
export async function mockTax(page: Page, opts: TaxMockOptions = {}): Promise<Recorded[]> {
  const calls: Recorded[] = [];
  const certs: CertSummary[] = (opts.certs ?? []).map((c) => ({ ...c }));
  const access: unknown[] = [...(opts.access ?? [])];

  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fallback();
    const url = new URL(req.url());
    const p = url.pathname;
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(data),
      });
    const record = () => calls.push({ method: req.method(), path: p, search: url.search, body });

    const dl = Object.entries(opts.download ?? {}).find(([prefix]) => p.startsWith(prefix));
    if (dl) {
      record();
      const [, d] = dl;
      return route.fulfill({
        status: d.status,
        contentType: d.contentType ?? (d.status === 200 ? "application/octet-stream" : "application/json"),
        headers: { "access-control-allow-origin": "*" },
        body: d.body,
      });
    }

    switch (`${req.method()} ${p}`) {
      case "GET /business-insights/tax-snapshot":
        record();
        return json({ data: opts.snapshot ?? SNAPSHOT_GIG });
      case "GET /self-assessment/summary":
        record();
        return json({ data: opts.summary ?? SA_SUMMARY });
      case "GET /self-assessment/checklist":
        record();
        return json({ data: CHECKLIST });
      case "GET /tax-planner":
        record();
        return json({ data: PLAN });
      case "PATCH /tax-planner/settings":
        record();
        return json({ data: PLAN.settings });
      case "GET /hmrc-reconciliation":
        record();
        return json({ data: RECON });
      case "POST /hmrc-reconciliation": {
        record();
        const b = body as { platform: string; hmrcReportedPence: number };
        return json({
          data: {
            ...RECON,
            rows: RECON.rows.map((r) =>
              r.platform === b.platform
                ? { ...r, hmrcReportedPence: b.hmrcReportedPence, diffPence: b.hmrcReportedPence - r.mileclearTrackedPence }
                : r
            ),
            totals: { ...RECON.totals, completedPlatforms: 1 },
          },
        });
      }
      case "GET /mileage-relief":
        record();
        return json({ data: opts.mar ?? MAR_DATA });
      case "GET /hmrc/status":
        record();
        if (opts.hmrcStatus === null) return json({ error: "HMRC integration not configured" }, 503);
        return json({ data: opts.hmrcStatus ?? { connected: false, environment: "sandbox", hasNino: false, hasBusinessId: false } });
      case "GET /hmrc/obligations":
        record();
        return json({
          data: {
            obligations: [
              { start: "2026-04-06", end: "2026-07-05", due: "2026-08-05", periodKey: "P1", status: "Fulfilled", isFulfilled: true, isOverdue: false, isDueSoon: false, daysUntilDue: -65 },
              { start: "2026-07-06", end: "2026-10-05", due: "2026-11-05", periodKey: "P2", status: "Open", isFulfilled: false, isOverdue: false, isDueSoon: false, daysUntilDue: 27 },
            ],
          },
        });
      case "POST /hmrc/disconnect":
        record();
        return json({ data: { disconnected: true } });
      case "GET /vehicles":
        record();
        return json({ data: opts.vehicles ?? [{ id: "v1", make: "Ford", model: "Fiesta" }] });
      case "POST /certificates/preview":
        record();
        return json({ data: CERT_PREVIEW });
      case "GET /certificates":
        record();
        return json({ data: certs });
      case "POST /certificates": {
        record();
        const b = body as { periodStart: string; periodEnd: string };
        const made: CertSummary = { ...CERT_ONE, id: `c${certs.length + 2}`, periodStart: b.periodStart, periodEnd: b.periodEnd };
        certs.unshift(made);
        return json({ data: made }, 201);
      }
      case "GET /accountant/access":
        record();
        return json({ data: access });
      case "POST /accountant/invite":
        record();
        access.unshift({
          id: "a1",
          email: (body as { email: string }).email,
          status: "pending",
          permissions: "read",
          lastAccessedAt: null,
          createdAt: "2026-10-09T09:00:00.000Z",
          expiresAt: null,
          source: "invite",
        });
        return json({ success: true, inviteId: "a1" }, 201);
      case "PATCH /user/profile":
        record();
        return json({ data: {} });
      default:
        break;
    }
    const revoke = p.match(/^\/certificates\/([^/]+)\/revoke$/);
    if (revoke && req.method() === "POST") {
      record();
      const c = certs.find((x) => x.id === revoke[1]);
      if (c) c.revokedAt = "2026-10-09T10:00:00.000Z";
      return json({ data: c });
    }
    const pdf = p.match(/^\/certificates\/([^/]+)\/pdf$/);
    if (pdf && req.method() === "GET") {
      record();
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "access-control-allow-origin": "*" },
        body: "%PDF-1.4 test",
      });
    }
    const delAccess = p.match(/^\/accountant\/access\/([^/]+)$/);
    if (delAccess && req.method() === "DELETE") {
      record();
      const i = access.findIndex((a) => (a as { id: string }).id === delAccess[1]);
      if (i >= 0) access.splice(i, 1);
      return json({ success: true });
    }
    return route.fallback();
  });
  return calls;
}
