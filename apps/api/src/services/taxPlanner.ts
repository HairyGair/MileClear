// Tax bill planner (4 Oct 2026). Free, auth only.
//
// "How much will I have to pay HMRC, and when?" The Tax Readiness card shows
// this year's tax so far; this turns it into the dated payments a
// self-employed driver actually makes (31 January and 31 July), including
// the first-year January that catches people out (last year's whole bill
// plus half of it again in advance).
//
// The rules and their GOV.UK sources are in taxPlannerMath.ts. This file
// only gathers the inputs:
//   - each year's taxable profit, worked out the same way as the Tax
//     Readiness card (services/taxSnapshot.ts buildTaxSnapshot): business
//     miles at the AMAP rate for that tax year (calculateMileageDeduction
//     with { taxYear }), earnings with invoice-linked duplicates removed,
//     basis-aware invoice income, allowable expenses. Keep the two in step.
//   - the current year multiplied up to 5 April at the pace so far,
//   - what the driver told us (User.taxPlanner): when they started, and any
//     bill from their HMRC calculation.

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { claimableWhere } from "../lib/claimableTrips.js";
import { fetchExpenseSummary } from "./export-data.js";
import { fallbackVehicleTypeFromList } from "./vehicleDefaults.js";
import { pushPrefEnabled } from "./pushPrefs.js";
import {
  calculateMileageDeduction,
  parseTaxYear,
  ukDateParts,
  type TaxPlan,
  type TaxPlannerSettings,
  type VehicleType,
} from "@mileclear/shared";
import {
  billFromProfit,
  buildPaymentSchedule,
  projectToYearEnd,
  resolvePlannerYears,
  shiftTaxYear,
  taxYearOfDay,
  taxYearStart,
  weeklySetAside,
  type UkDay,
} from "./taxPlannerMath.js";

const TAX_YEAR_RE = /^\d{4}-\d{2}$/;
/** £10m. Anything above is a typo, not a driver's tax bill. */
export const MAX_ENTERED_BILL_PENCE = 1_000_000_000;

/** Read User.taxPlanner defensively: it's free-form JSON. */
export function parsePlannerSettings(raw: Prisma.JsonValue | null | undefined): TaxPlannerSettings {
  const out: TaxPlannerSettings = { firstSelfEmployedTaxYear: null, bills: {} };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  const started = obj.firstSelfEmployedTaxYear;
  if (started === "earlier" || (typeof started === "string" && TAX_YEAR_RE.test(started))) {
    out.firstSelfEmployedTaxYear = started;
  }
  const bills = obj.bills;
  if (bills && typeof bills === "object" && !Array.isArray(bills)) {
    for (const [taxYear, v] of Object.entries(bills as Record<string, unknown>)) {
      if (!TAX_YEAR_RE.test(taxYear)) continue;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_ENTERED_BILL_PENCE) continue;
      out.bills[taxYear] = v;
    }
  }
  return out;
}

interface PlannerUser {
  createdAt: Date;
  workType: string;
  dashboardMode: string;
  employerMileageRatePence: number | null;
  employerMileageRatePenceAfter10k: number | null;
  otherAnnualIncomePence: number | null;
  payeAnnualPaidTaxPence: number | null;
  taxBasis: string;
  pushPrefs: Prisma.JsonValue | null;
  taxPlanner: Prisma.JsonValue | null;
}

const PLANNER_USER_SELECT = {
  createdAt: true,
  workType: true,
  dashboardMode: true,
  employerMileageRatePence: true,
  employerMileageRatePenceAfter10k: true,
  otherAnnualIncomePence: true,
  payeAnnualPaidTaxPence: true,
  taxBasis: true,
  pushPrefs: true,
  taxPlanner: true,
} as const;

/**
 * Taxable profit for one tax year (up to now, for the current one): the
 * same sum as buildTaxSnapshot. Earnings - mileage deduction - allowable
 * expenses, floored at 0.
 */
async function yearProfit(
  userId: string,
  taxYear: string,
  user: PlannerUser,
  fallbackVehicleType: VehicleType
): Promise<{ taxableProfitPence: number; grossEarningsPence: number }> {
  const { start, end } = parseTaxYear(taxYear);
  const basis = user.taxBasis === "accruals" ? "accruals" : "cash";
  const [trips, earnings, invoices, expenses] = await Promise.all([
    prisma.trip.findMany({
      where: claimableWhere({ userId, classification: "business", isPhantomTrip: false, startedAt: { gte: start, lte: end } }),
      select: { distanceMiles: true, vehicle: { select: { vehicleType: true } } },
    }),
    prisma.earning.findMany({
      where: { userId, periodStart: { gte: start }, periodEnd: { lte: end } },
      select: { amountPence: true, replacedByInvoiceId: true },
    }),
    prisma.invoice.findMany({
      where: {
        userId,
        status: { not: "written_off" },
        ...(basis === "cash" ? { paidAt: { gte: start, lte: end } } : { sentAt: { gte: start, lte: end } }),
      },
      select: { id: true, amountPence: true },
    }),
    fetchExpenseSummary(userId, taxYear),
  ]);

  // The approved rates, the same as the Tax tab and the Self Assessment
  // wizard; before 7 Oct 2026 this used the driver's employer rate.
  const milesByType = new Map<VehicleType, number>();
  for (const t of trips) {
    const raw = (t.vehicle?.vehicleType ?? fallbackVehicleType) as VehicleType;
    // Cars and vans share one 10,000-mile threshold (EIM31240/31275), the
    // same grouping as taxSnapshot.ts and mileage.ts.
    const type: VehicleType = raw === "van" ? "car" : raw;
    milesByType.set(type, (milesByType.get(type) ?? 0) + t.distanceMiles);
  }
  let mileagePence = 0;
  for (const [type, miles] of milesByType) {
    mileagePence += calculateMileageDeduction(type, miles, { taxYear }).deductionPence;
  }

  const invoiceIds = new Set(invoices.map((i) => i.id));
  const earningsPence = earnings
    .filter((e) => !e.replacedByInvoiceId || !invoiceIds.has(e.replacedByInvoiceId))
    .reduce((sum, e) => sum + e.amountPence, 0);
  const grossEarningsPence = earningsPence + invoices.reduce((sum, i) => sum + i.amountPence, 0);

  return {
    taxableProfitPence: Math.max(0, grossEarningsPence - mileagePence - expenses.totalAllowablePence),
    grossEarningsPence,
  };
}

export async function loadTaxPlan(userId: string, now: Date = new Date()): Promise<TaxPlan | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PLANNER_USER_SELECT });
  if (!user) return null;
  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    select: { vehicleType: true, isPrimary: true },
  });
  const fallbackVehicleType = fallbackVehicleTypeFromList(vehicles);

  const p = ukDateParts(now);
  const today: UkDay = { year: p.year, month: p.month, day: p.day };
  const current = taxYearOfDay(today);
  const yearList = [shiftTaxYear(current, -2), shiftTaxYear(current, -1), current];
  const settings = parsePlannerSettings(user.taxPlanner);
  const payeDeductedPence = user.payeAnnualPaidTaxPence ?? 0;

  const profits = await Promise.all(yearList.map((y) => yearProfit(userId, y, user, fallbackVehicleType)));

  const estimates: Record<string, { billPence: number; hasEarnings: boolean }> = {};
  yearList.forEach((taxYear, i) => {
    const { taxableProfitPence, grossEarningsPence } = profits[i];
    const profit = taxYear === current ? projectToYearEnd(taxableProfitPence, today, taxYear) : taxableProfitPence;
    estimates[taxYear] = {
      billPence: billFromProfit(profit, {
        otherIncomePence: user.otherAnnualIncomePence,
        payeDeductedPence,
      }).billPence,
      hasEarnings: grossEarningsPence > 0,
    };
  });

  const years = resolvePlannerYears({
    currentTaxYear: current,
    firstSelfEmployedTaxYear: settings.firstSelfEmployedTaxYear,
    enteredBills: settings.bills,
    estimates,
    deductedAtSourcePence: payeDeductedPence,
  });
  const payments = buildPaymentSchedule(today, years);
  const { weeklyPence, coversTo } = weeklySetAside(payments);

  return {
    currentTaxYear: current,
    years: years.map((y, i) => ({
      taxYear: y.taxYear,
      billPence: y.billPence,
      source: y.source,
      recordedEarningsPence: profits[i].grossEarningsPence,
      partialYear: user.createdAt > parseTaxYear(y.taxYear).start && y.source === "estimate",
    })),
    payments,
    weeklySetAsidePence: weeklyPence,
    coversTo,
    missingCurrentEarnings: profits[2].grossEarningsPence <= 0,
    startAssumed: settings.firstSelfEmployedTaxYear == null,
    settings,
    remindersOn: pushPrefEnabled(user.pushPrefs, "taxDeadline"),
    mayNotApply: user.workType === "employee" || user.dashboardMode === "personal",
  };
}

export interface PlannerSettingsPatch {
  firstSelfEmployedTaxYear?: string | null;
  /** null removes a bill (back to MileClear's estimate). */
  bills?: Record<string, number | null>;
}

/** Merge a patch into the stored settings. Only the three years the planner
 *  reads are kept, so the JSON never grows. */
export function mergePlannerSettings(
  existing: TaxPlannerSettings,
  patch: PlannerSettingsPatch,
  currentTaxYear: string
): TaxPlannerSettings {
  const keep = new Set([shiftTaxYear(currentTaxYear, -2), shiftTaxYear(currentTaxYear, -1), currentTaxYear]);
  const bills: Record<string, number> = {};
  for (const [y, v] of Object.entries(existing.bills)) if (keep.has(y)) bills[y] = v;
  for (const [y, v] of Object.entries(patch.bills ?? ({} as Record<string, number | null>))) {
    if (!keep.has(y)) continue;
    if (v == null) delete bills[y];
    else bills[y] = v;
  }
  let started = existing.firstSelfEmployedTaxYear;
  if (patch.firstSelfEmployedTaxYear !== undefined) {
    const s = patch.firstSelfEmployedTaxYear;
    // A start year older than the year before last is the same as "earlier".
    started =
      s && s !== "earlier" && taxYearStart(s) < taxYearStart(currentTaxYear) - 2 ? "earlier" : s;
  }
  return { firstSelfEmployedTaxYear: started, bills };
}

export async function updatePlannerSettings(
  userId: string,
  patch: PlannerSettingsPatch,
  now: Date = new Date()
): Promise<TaxPlannerSettings | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { taxPlanner: true } });
  if (!user) return null;
  const p = ukDateParts(now);
  const current = taxYearOfDay({ year: p.year, month: p.month, day: p.day });
  const merged = mergePlannerSettings(parsePlannerSettings(user.taxPlanner), patch, current);
  await prisma.user.update({
    where: { id: userId },
    data: { taxPlanner: merged as unknown as Prisma.InputJsonValue },
  });
  return merged;
}
