// HMRC MTD ITSA — period summary mapping.
//
// Aggregates a user's MileClear data (earnings, business mileage, expenses)
// into the payload shape required by Self Employment Business API v5.0
// when creating or amending a quarterly period summary.
//
// The hard parts this module owns:
//
//   1. Quarter boundary math. UK MTD quarters can be standard
//      (6 Apr / 6 Jul / 6 Oct / 6 Jan) or calendar (1 Apr / 1 Jul / 1 Oct
//      / 1 Jan). MileClear submits standard quarters by default; we expose
//      the calendar option for users who've elected it with HMRC.
//
//   2. Mileage tier crossing. The HMRC AMAP 10,000-mile threshold is per
//      tax year, not per period. A user with 8k miles in Q1 + 4k in Q2
//      gets 2k at the first-tier rate (top-up to 10k) + 2k at 25p in Q2,
//      not 4k at the first-tier rate. Rate is tax-year-aware: 45p up to
//      and including 2025-26, 55p from 2026-27 onwards.
//      We compute prior-period business mileage to apply the right tier.
//
//   3. AMAP/actual-cost mutual exclusion. When using AMAP (the simplified
//      mileage rate) you cannot ALSO claim fuel/insurance/repairs/road
//      tax/MOT — they're folded into the per-mile rate. MileClear assumes
//      AMAP for self-employed gig drivers (the overwhelming default), so
//      we include only "deductibleWithMileage" expenses + the AMAP figure
//      itself. Vehicle running-cost expenses are tracked but not submitted.
//
//   4. Pence → pounds. HMRC validates that every monetary value has at
//      most 2 decimal places. We convert via toFixed(2) → Number to dodge
//      float-precision artefacts (12345 / 100 is safe, but 12345.6789 / 100
//      is not — always go through toFixed).
//
// What we do NOT own:
//   - Submitting the payload (selfEmployment.submitPeriodSummary)
//   - Vehicle-type splitting when a user has multiple vehicles. Phase A
//     uses the user's primary vehicle. Multi-vehicle is a Phase 2.x todo.
//   - Disallowable-expenses computation. We assume all logged expenses
//     are 100% allowable (we don't ask the user for a business %). The
//     periodDisallowableExpenses block is omitted entirely.
//
// Reference: https://developer.service.hmrc.uk/api-documentation/docs/api/service/self-employment-business-api/5.0

import type { PrismaClient } from "@prisma/client";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type Sa103sBox,
} from "@mileclear/shared";
import { calculateMileageDeduction } from "@mileclear/shared";
import type {
  HmrcPeriodIncome,
  HmrcPeriodExpenses,
} from "./selfEmployment.js";

/** A quarterly window in YYYY-MM-DD format, ready to send to HMRC. */
export interface QuarterBoundary {
  /** 1-indexed (Q1, Q2, Q3, Q4). */
  quarterIndex: 1 | 2 | 3 | 4;
  /** Inclusive start date in YYYY-MM-DD. */
  periodStartDate: string;
  /** Inclusive end date in YYYY-MM-DD. */
  periodEndDate: string;
}

/**
 * Generate the four standard MTD quarterly periods for a UK tax year.
 *
 * Standard MTD quarters use the 6th of the relevant month (matching the
 * 6 April tax year boundary):
 *
 *   Q1: 6 April  → 5 July
 *   Q2: 6 July   → 5 October
 *   Q3: 6 October → 5 January
 *   Q4: 6 January → 5 April
 *
 * Calendar quarters (1 April / 1 July / 1 October / 1 January) are an
 * opt-in HMRC election; not used by MileClear today. If we add support
 * later, take a `style: "standard" | "calendar"` argument.
 */
export function getQuartersForTaxYear(taxYear: string): QuarterBoundary[] {
  const match = /^(\d{4})-(\d{2})$/.exec(taxYear);
  if (!match) {
    throw new Error(`Invalid HMRC tax year format: ${taxYear} (expected YYYY-YY)`);
  }
  const yearStart = parseInt(match[1], 10);
  const yearEnd = yearStart + 1;
  const expectedShort = yearEnd % 100;
  if (parseInt(match[2], 10) !== expectedShort) {
    throw new Error(`Invalid HMRC tax year: ${taxYear} (halves must be consecutive)`);
  }

  return [
    { quarterIndex: 1, periodStartDate: `${yearStart}-04-06`, periodEndDate: `${yearStart}-07-05` },
    { quarterIndex: 2, periodStartDate: `${yearStart}-07-06`, periodEndDate: `${yearStart}-10-05` },
    { quarterIndex: 3, periodStartDate: `${yearStart}-10-06`, periodEndDate: `${yearEnd}-01-05` },
    { quarterIndex: 4, periodStartDate: `${yearEnd}-01-06`, periodEndDate: `${yearEnd}-04-05` },
  ];
}

/** Convert a date to YYYY-MM-DD in UTC (HMRC dates are calendar dates, no TZ). */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Convert pence (integer) to pounds (number with at most 2 decimals).
 * Uses toFixed → Number to guarantee no float-precision artefacts —
 * 12345 / 100 is fine, but blindly relying on division across all callers
 * is fragile, so we centralise.
 */
export function penceToPounds(pence: number): number {
  if (!Number.isFinite(pence)) return 0;
  return Number((pence / 100).toFixed(2));
}

/** Round-trip-safe pounds-to-pence (used in tests + reverse-mapping). */
export function poundsToPence(pounds: number): number {
  if (!Number.isFinite(pounds)) return 0;
  return Math.round(pounds * 100);
}

/** Map of ExpenseCategory → SA103S box, derived from EXPENSE_CATEGORIES. */
const EXPENSE_BOX_MAP: Record<ExpenseCategory, Sa103sBox> = (() => {
  const map: Record<string, Sa103sBox> = {};
  for (const cat of EXPENSE_CATEGORIES) {
    map[cat.value] = cat.sa103sBox;
  }
  return map as Record<ExpenseCategory, Sa103sBox>;
})();

/** Map of ExpenseCategory → whether it's claimable alongside AMAP mileage. */
const EXPENSE_AMAP_COMPATIBLE: Record<ExpenseCategory, boolean> = (() => {
  const map: Record<string, boolean> = {};
  for (const cat of EXPENSE_CATEGORIES) {
    map[cat.value] = cat.deductibleWithMileage;
  }
  return map as Record<ExpenseCategory, boolean>;
})();

/**
 * Detailed breakdown returned alongside the HMRC payload. Used by the
 * preview screen ("here's what we're about to send to HMRC") and stored
 * in the audit log so we can prove what we computed against if HMRC
 * disputes a figure later.
 */
export interface PeriodSubmissionBreakdown {
  income: {
    turnoverPence: number;
    otherPence: number;
    earningCount: number;
    perPlatform: { platform: string; pence: number; count: number }[];
  };
  mileage: {
    businessMilesThisPeriod: number;
    businessMilesPriorInTaxYear: number;
    deductionPence: number;
    rateFirst10kPence: number;
    rateAfter10kPence: number;
    vehicleType: "car" | "van" | "motorbike";
    crossesTenKThreshold: boolean;
    tripCount: number;
  };
  expenses: {
    /** Box 17 — carVanTravelExpenses (parking + tolls + congestion + AMAP). */
    carVanTravelPence: number;
    /** Box 18 — adminCosts (phone, equipment, clothing, subs). */
    adminCostsPence: number;
    /** Box 19 — otherExpenses (subsistence, accommodation, professional fees, other). */
    otherExpensesPence: number;
    /** Expenses we deliberately excluded (motor running costs while on AMAP). */
    excludedNonAmapPence: number;
    expenseCount: number;
  };
  warnings: string[];
}

export interface PeriodSubmissionPayload {
  periodDates: {
    periodStartDate: string;
    periodEndDate: string;
  };
  periodIncome: HmrcPeriodIncome;
  periodExpenses: HmrcPeriodExpenses;
  /** For audit + preview UI; never sent to HMRC. */
  breakdown: PeriodSubmissionBreakdown;
}

/**
 * Build the HMRC period summary payload from MileClear data.
 *
 * Performance note: this issues 3 Prisma reads (earnings, trips, expenses)
 * plus 1 user lookup + 1 vehicle lookup. Acceptable — period submission is
 * a deliberate user-initiated action, not a hot path.
 */
export async function buildPeriodSubmission(args: {
  prisma: PrismaClient;
  userId: string;
  taxYear: string;
  periodStartDate: string;
  periodEndDate: string;
}): Promise<PeriodSubmissionPayload> {
  const { prisma, userId, taxYear, periodStartDate, periodEndDate } = args;

  const periodStart = new Date(`${periodStartDate}T00:00:00.000Z`);
  const periodEnd = new Date(`${periodEndDate}T23:59:59.999Z`);
  const taxYearStart = parseTaxYearStart(taxYear);

  if (periodStart < taxYearStart) {
    throw new Error(
      `periodStartDate ${periodStartDate} is before tax year ${taxYear} start (${toIsoDate(taxYearStart)})`
    );
  }
  if (periodEnd <= periodStart) {
    throw new Error(`periodEndDate must be after periodStartDate`);
  }

  const warnings: string[] = [];

  // ── Income (earnings) ────────────────────────────────────────────────
  // Inclusion rule: an earning belongs to this period if its periodStart
  // falls within the submission window. Most gig platforms pay weekly with
  // periodStart = the week's first day; this is a clean cash-basis proxy.
  const earnings = await prisma.earning.findMany({
    where: {
      userId,
      periodStart: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, platform: true, amountPence: true },
  });

  const turnoverPence = earnings.reduce((sum, e) => sum + e.amountPence, 0);
  const perPlatformAgg = new Map<string, { pence: number; count: number }>();
  for (const e of earnings) {
    const existing = perPlatformAgg.get(e.platform) ?? { pence: 0, count: 0 };
    existing.pence += e.amountPence;
    existing.count += 1;
    perPlatformAgg.set(e.platform, existing);
  }
  const perPlatform = Array.from(perPlatformAgg.entries())
    .map(([platform, v]) => ({ platform, pence: v.pence, count: v.count }))
    .sort((a, b) => b.pence - a.pence);

  // ── Mileage deduction ────────────────────────────────────────────────
  // Pull primary vehicle for vehicle-type. Multi-vehicle splitting is a
  // Phase 2.x todo — see the note at the top of this file.
  const primaryVehicle = await prisma.vehicle.findFirst({
    where: { userId, isPrimary: true },
    select: { vehicleType: true, make: true, model: true },
  });

  const vehicleType: "car" | "van" | "motorbike" = isValidVehicleType(
    primaryVehicle?.vehicleType
  )
    ? (primaryVehicle!.vehicleType as "car" | "van" | "motorbike")
    : "car"; // sensible default — overwhelmingly the right answer for gig drivers

  if (!primaryVehicle) {
    warnings.push(
      "No primary vehicle set — defaulted to car for AMAP rate. Set a primary vehicle for accuracy."
    );
  } else if (!isValidVehicleType(primaryVehicle.vehicleType)) {
    warnings.push(
      `Primary vehicle has unsupported vehicleType "${primaryVehicle.vehicleType}" — defaulted to car.`
    );
  }

  // Business miles this period (excluding phantom trips).
  const tripsThisPeriod = await prisma.trip.findMany({
    where: {
      userId,
      classification: "business",
      isPhantomTrip: false,
      startedAt: { gte: periodStart, lte: periodEnd },
    },
    select: { distanceMiles: true },
  });
  const milesThisPeriod = tripsThisPeriod.reduce(
    (sum, t) => sum + t.distanceMiles,
    0
  );

  // Business miles earlier in the same tax year — needed for tier crossing.
  const tripsPriorInTaxYear = await prisma.trip.aggregate({
    where: {
      userId,
      classification: "business",
      isPhantomTrip: false,
      startedAt: { gte: taxYearStart, lt: periodStart },
    },
    _sum: { distanceMiles: true },
  });
  const milesPriorInTaxYear = tripsPriorInTaxYear._sum.distanceMiles ?? 0;

  // Two-step calc: deduction up to AND through this period, minus deduction
  // for prior-period miles. Difference is what this period contributes,
  // accurately straddling the 10k threshold.
  const cumulativeBefore = calculateMileageDeduction(
    vehicleType,
    milesPriorInTaxYear,
    { taxYear }
  );
  const cumulativeAfter = calculateMileageDeduction(
    vehicleType,
    milesPriorInTaxYear + milesThisPeriod,
    { taxYear }
  );
  const mileageDeductionPence =
    cumulativeAfter.deductionPence - cumulativeBefore.deductionPence;

  const crossesTenK =
    milesPriorInTaxYear < 10_000 &&
    milesPriorInTaxYear + milesThisPeriod > 10_000;
  if (crossesTenK) {
    warnings.push(
      `Business mileage crosses the 10,000-mile threshold during this period — ` +
        `tier-crossing handled automatically.`
    );
  }

  // ── Expenses ─────────────────────────────────────────────────────────
  const expenses = await prisma.expense.findMany({
    where: {
      userId,
      date: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, category: true, amountPence: true },
  });

  let carVanTravelPence = 0;
  let adminCostsPence = 0;
  let otherExpensesPence = 0;
  let excludedNonAmapPence = 0;
  let expenseCount = 0;

  for (const exp of expenses) {
    const cat = exp.category as ExpenseCategory;
    const box = EXPENSE_BOX_MAP[cat];
    const amapCompatible = EXPENSE_AMAP_COMPATIBLE[cat];

    if (box === undefined) {
      // Unknown category — log a warning, don't include in submission.
      warnings.push(
        `Skipped expense in unknown category "${exp.category}" — review and recategorise.`
      );
      continue;
    }

    // AMAP-incompatible motor expenses (fuel, insurance, road tax, MOT,
    // maintenance) are excluded entirely. They're folded into the AMAP
    // per-mile rate — claiming them on top would be double-counting.
    if (!amapCompatible) {
      excludedNonAmapPence += exp.amountPence;
      continue;
    }

    expenseCount += 1;
    if (box === 17) carVanTravelPence += exp.amountPence;
    else if (box === 18) adminCostsPence += exp.amountPence;
    else if (box === 19) otherExpensesPence += exp.amountPence;
  }

  // Mileage deduction itself goes into carVanTravelExpenses (Box 17).
  // Parking/tolls/congestion sit alongside it in the same bucket.
  carVanTravelPence += mileageDeductionPence;

  if (excludedNonAmapPence > 0) {
    warnings.push(
      `Excluded £${(excludedNonAmapPence / 100).toFixed(2)} of motor running costs ` +
        `(fuel, insurance, road tax, MOT, maintenance) — these are folded into the ` +
        `AMAP per-mile rate and cannot be claimed alongside.`
    );
  }

  // ── Build payload ────────────────────────────────────────────────────
  const periodIncome: HmrcPeriodIncome = {
    turnover: penceToPounds(turnoverPence),
    other: 0, // MileClear has no concept of "other business income" today
  };

  // Only include expense fields that are non-zero. HMRC accepts an empty
  // expenses block, but sending zero-fields is noisier in audit logs.
  const periodExpenses: HmrcPeriodExpenses = {};
  if (carVanTravelPence > 0) {
    periodExpenses.carVanTravelExpenses = penceToPounds(carVanTravelPence);
  }
  if (adminCostsPence > 0) {
    periodExpenses.adminCosts = penceToPounds(adminCostsPence);
  }
  if (otherExpensesPence > 0) {
    periodExpenses.otherExpenses = penceToPounds(otherExpensesPence);
  }

  return {
    periodDates: {
      periodStartDate,
      periodEndDate,
    },
    periodIncome,
    periodExpenses,
    breakdown: {
      income: {
        turnoverPence,
        otherPence: 0,
        earningCount: earnings.length,
        perPlatform,
      },
      mileage: {
        businessMilesThisPeriod: milesThisPeriod,
        businessMilesPriorInTaxYear: milesPriorInTaxYear,
        deductionPence: mileageDeductionPence,
        rateFirst10kPence: cumulativeAfter.rateFirst10kPence,
        rateAfter10kPence: cumulativeAfter.rateAfter10kPence,
        vehicleType,
        crossesTenKThreshold: crossesTenK,
        tripCount: tripsThisPeriod.length,
      },
      expenses: {
        carVanTravelPence,
        adminCostsPence,
        otherExpensesPence,
        excludedNonAmapPence,
        expenseCount,
      },
      warnings,
    },
  };
}

function isValidVehicleType(t: string | null | undefined): boolean {
  return t === "car" || t === "van" || t === "motorbike";
}

function parseTaxYearStart(taxYear: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(taxYear);
  if (!match) {
    throw new Error(`Invalid HMRC tax year format: ${taxYear} (expected YYYY-YY)`);
  }
  const yearStart = parseInt(match[1], 10);
  return new Date(`${yearStart}-04-06T00:00:00.000Z`);
}
