// GET /tax/overview (Tax tab rebuild, 10 Oct 2026).
//
// Everything the Tax tab and the Home tax line show, in one request. This
// file does NO tax, rate or date maths of its own: every figure comes from
// the service that already owns it, so the Tax tab can never disagree with
// Home, Insights, the checklist or the Self Assessment wizard:
//
//   claim     readTaxYearSummary   (the row /gamification/stats reads)
//   return    loadSaChecklist      (the checklist screen)
//   thisYear  buildTaxSnapshot     (/business-insights tax snapshot)
//   plan      loadTaxPlan          (/tax-planner)
//   relief    loadMileageReliefData (/mileage-relief)
//
// The only decisions made here are which sections a driver needs (by work
// type and team membership) and `lead` (shared taxPageLead).

import { prisma } from "../lib/prisma.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import {
  getTaxYear,
  nextPayment,
  taxPageLead,
  ukDateParts,
  type TaxOverview,
  type WorkType,
} from "@mileclear/shared";
import { readTaxYearSummary } from "./gamification.js";
import { loadSaChecklist } from "./saChecklist.js";
import { buildTaxSnapshot } from "./taxSnapshot.js";
import { loadTaxPlan } from "./taxPlanner.js";
import { loadMileageReliefData } from "./mileageRelief.js";
import { isProUser } from "./proEntitlement.js";

const CACHE_SECONDS = 30;

type SectionName = TaxOverview["failed"][number];

function cacheKey(userId: string) {
  return `tax-overview:${userId}`;
}

/** "2026-10-10" for the UK calendar date of an instant. */
function ukDateString(now: Date): string {
  const p = ukDateParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function toWorkType(raw: string | null | undefined): Exclude<WorkType, "company"> {
  // A company car is an employer-paid driver: same tax persona as an employee.
  if (raw === "company") return "employee";
  return raw === "employee" || raw === "both" ? raw : "gig";
}

export interface LoadTaxOverviewOptions {
  now?: Date;
  /** Skip the 30 second cache (pull to refresh). */
  fresh?: boolean;
  /** A pinned `now` (admin asOf) is never cached. */
  cache?: boolean;
}

export async function loadTaxOverview(
  userId: string,
  opts: LoadTaxOverviewOptions = {}
): Promise<TaxOverview | null> {
  const now = opts.now ?? new Date();
  const useCache = opts.cache !== false && !opts.now;
  if (useCache && !opts.fresh) {
    const hit = await cacheGet(cacheKey(userId));
    if (hit) {
      try {
        return JSON.parse(hit) as TaxOverview;
      } catch {
        // fall through and rebuild
      }
    }
  }

  const [user, membership, anyTrip, premium] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { workType: true } }),
    // Same query as GET /team/me.
    prisma.orgMembership.findFirst({
      where: { userId, status: "active" },
      select: { id: true },
    }),
    prisma.trip.findFirst({
      where: { userId, isPhantomTrip: false },
      select: { id: true },
    }),
    isProUser(userId),
  ]);
  if (!user) return null;

  const workType = toWorkType(user.workType);
  const isCompanyDriver = !!membership;
  const selfEmployed = workType === "gig" || workType === "both";
  const needsRelief = workType === "employee" || workType === "both" || isCompanyDriver;
  // Same call as getStats(), so claim and /gamification/stats read one row.
  const taxYear = getTaxYear(now);

  const skipped = Promise.resolve(null);
  const [claimR, checklistR, snapshotR, planR, reliefR] = await Promise.allSettled([
    readTaxYearSummary(userId, taxYear),
    selfEmployed ? loadSaChecklist(userId, { now }) : skipped,
    selfEmployed ? buildTaxSnapshot(userId, now) : skipped,
    selfEmployed ? loadTaxPlan(userId, now) : skipped,
    needsRelief ? loadMileageReliefData(userId, now) : skipped,
  ]);

  const failed: SectionName[] = [];
  const settle = <T>(name: SectionName, r: PromiseSettledResult<T>): T | null => {
    if (r.status === "fulfilled") return r.value;
    failed.push(name);
    console.error(`tax.overview_section_failed ${name}`, r.reason);
    return null;
  };

  const summary = settle("claim", claimR);
  const checklist = settle("return", checklistR);
  const snapshot = settle("thisYear", snapshotR);
  const plan = settle("plan", planR);
  const relief = settle("relief", reliefR);

  // A driver who started working for themselves this tax year has no return
  // to file yet: no ReturnCard, and "this tax year so far" leads all year.
  const startedThisYear =
    !!plan && plan.settings.firstSelfEmployedTaxYear === plan.currentTaxYear;

  const overview: TaxOverview = {
    today: ukDateString(now),
    lead: startedThisYear ? "this_year" : taxPageLead(now),
    workType,
    isCompanyDriver,
    isPremium: premium,
    hasTrips: !!anyTrip,

    claim: failed.includes("claim")
      ? null
      : {
          taxYear,
          totalMiles: summary?.totalMiles ?? 0,
          businessMiles: summary?.businessMiles ?? 0,
          claimPence: summary?.deductionPence ?? 0,
        },

    return:
      checklist && !startedThisYear
        ? {
            taxYear: checklist.taxYear,
            deadline: checklist.deadline,
            daysToDeadline: checklist.daysToDeadline,
            attentionCount: checklist.attentionCount,
            headline: checklist.headline,
            attentionItems: checklist.items.filter((i) => i.status === "attention"),
            returnMileagePence: checklist.mileageClaimPence,
            businessMiles: checklist.businessMiles,
            earningsPence: checklist.earningsPence,
          }
        : null,

    thisYear: snapshot
      ? {
          taxYear: snapshot.taxYear,
          estimatedTaxPence: snapshot.ytd.estimatedTaxPence,
          grossEarningsPence: snapshot.ytd.grossEarningsPence,
          returnMileagePence: snapshot.ytd.mileageDeductionPence,
          allowableExpensesPence: snapshot.ytd.allowableExpensesPence ?? 0,
          higherRateHeadroomPence: snapshot.ytd.higherRateHeadroomPence ?? null,
          mileageDerivation: snapshot.ytd.mileageDeductionDerivation,
          earningsDerivation: snapshot.ytd.earningsDerivation ?? null,
        }
      : null,

    plan: plan
      ? {
          weeklySetAsidePence: plan.weeklySetAsidePence,
          accountantWeeklyFeePence: plan.accountantWeeklyFeePence ?? 0,
          coversTo: plan.coversTo,
          nextPayment: nextPayment(plan.payments),
          missingCurrentEarnings: plan.missingCurrentEarnings,
          startAssumed: plan.startAssumed,
          firstSelfEmployedTaxYear: plan.settings.firstSelfEmployedTaxYear,
        }
      : null,

    relief,
    failed,
  };

  // Do not cache a partial answer: the next request should retry the failure.
  if (useCache && failed.length === 0) {
    await cacheSet(cacheKey(userId), JSON.stringify(overview), CACHE_SECONDS).catch(() => {});
  }
  return overview;
}
