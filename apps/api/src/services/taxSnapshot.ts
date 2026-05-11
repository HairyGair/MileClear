import { prisma } from "../lib/prisma.js";
import {
  estimateUkTax,
  calculateMileageDeduction,
  resolveMileageRates,
  getTaxYear,
  parseTaxYear,
  formatPence,
  formatMiles,
  HMRC_RATES,
  HMRC_THRESHOLD_MILES,
  type TaxSnapshot,
  type ReadinessItem,
  type VehicleType,
  type NumberDerivation,
  type NumberAcrossWindows,
} from "@mileclear/shared";

/**
 * Build the dashboard tax snapshot for a user. Free for all users (auth only,
 * no premium gate). The point of the snapshot is to make the "this app saves
 * me money at tax time" value tangible all year, not just at year-end.
 *
 * Distinct from the premium /self-assessment/summary endpoint, which returns
 * the full Self Assessment wizard data (per-vehicle, per-platform, SA103 box
 * values, allowable expense breakdown). The snapshot is deliberately simpler:
 * earnings minus mileage deduction = profit, no expense allocation.
 */
export async function buildTaxSnapshot(userId: string): Promise<TaxSnapshot> {
  const now = new Date();
  const taxYear = getTaxYear(now);
  const { start, end } = parseTaxYear(taxYear);

  // Filing deadline is 31 January after the end of the tax year.
  // Tax year 2025-26 ends 5 April 2026, deadline 31 January 2027.
  const deadlineYear = end.getFullYear() + 1;
  const filingDeadline = new Date(Date.UTC(deadlineYear, 0, 31, 23, 59, 59));
  const daysToFilingDeadline = Math.floor(
    (filingDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Last 7 days for set-aside calculation (rolling window, not aligned to week).
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // Last 14 days = "recent activity" signal for the earnings nudge.
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  // Last 30 days = "engagement window" for the earnings nudge.
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    user,
    vehicles,
    businessTrips,
    earningsYtd,
    earningsLast7d,
    unclassifiedCount,
    recentBusinessTripCount,
    recentEarningsCount,
  ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          fullName: true,
          workType: true,
          employerMileageRatePence: true,
          employerMileageRatePenceAfter10k: true,
          otherAnnualIncomePence: true,
          payeAnnualPaidTaxPence: true,
          taxBasis: true,
        },
      }),
      prisma.vehicle.findMany({
        where: { userId },
        select: {
          id: true,
          isPrimary: true,
          vehicleType: true,
          estimatedMpg: true,
          actualMpg: true,
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      }),
      prisma.trip.findMany({
        where: {
          userId,
          classification: "business",
          isPhantomTrip: false,
          startedAt: { gte: start, lte: end },
        },
        select: {
          distanceMiles: true,
          vehicle: { select: { vehicleType: true } },
        },
      }),
      prisma.earning.aggregate({
        where: {
          userId,
          periodStart: { gte: start },
          periodEnd: { lte: end },
        },
        _sum: { amountPence: true },
      }),
      prisma.earning.aggregate({
        where: {
          userId,
          periodStart: { gte: sevenDaysAgo },
        },
        _sum: { amountPence: true },
      }),
      prisma.trip.count({
        where: {
          userId,
          classification: "unclassified",
          // Phantom trips (walking-speed false-positives) are flagged and
          // hidden from the user's trips list — they shouldn't count toward
          // the readiness "all trips classified" check either, or the card
          // shows N to classify when the user can't actually see them.
          isPhantomTrip: false,
          startedAt: { gte: start, lte: end },
        },
      }),
      // Nudge inputs: are they recently active on trips?
      prisma.trip.count({
        where: {
          userId,
          classification: "business",
          isPhantomTrip: false,
          startedAt: { gte: fourteenDaysAgo },
        },
      }),
      // Have they engaged with earnings recently?
      prisma.earning.count({
        where: {
          userId,
          periodStart: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    // Nudge: actively tracking trips but not logging earnings.
    const earningsNudge = recentBusinessTripCount >= 3 && recentEarningsCount === 0;

  // Mileage deduction: group business miles by vehicle type so the right AMAP
  // rate is applied. Trips without a linked vehicle assume car (most common).
  const milesByType = new Map<VehicleType, number>();
  for (const trip of businessTrips) {
    const type = (trip.vehicle?.vehicleType ?? "car") as VehicleType;
    milesByType.set(type, (milesByType.get(type) ?? 0) + trip.distanceMiles);
  }
  const rateOpts = user ? resolveMileageRates(user) : {};
  let mileageDeductionPence = 0;
  for (const [type, miles] of milesByType) {
    mileageDeductionPence += calculateMileageDeduction(type, miles, rateOpts).deductionPence;
  }

  // Sole-trader invoices (Laura Joyce feature, 10 May 2026): basis-aware
  // aggregation. Cash basis counts only invoices marked paid (date the
  // money actually arrived); accruals counts every sent invoice that
  // hasn't been written off. Default basis is cash for new users.
  const userTaxBasis = (user?.taxBasis ?? "cash") as "cash" | "accruals";
  const invoiceTotals = await prisma.invoice.aggregate({
    where: {
      userId,
      status: { not: "written_off" },
      ...(userTaxBasis === "cash"
        ? { paidAt: { gte: start, lte: end } }
        : { sentAt: { gte: start, lte: end } }),
    },
    _sum: { amountPence: true },
  });
  const invoiceIncomePence = invoiceTotals._sum.amountPence ?? 0;

  const earningsBasePence = earningsYtd._sum.amountPence ?? 0;
  const grossEarningsPence = earningsBasePence + invoiceIncomePence;
  const earningsLast7DaysPence = earningsLast7d._sum.amountPence ?? 0;

  // Profit = earnings - mileage deduction. Snapshot is intentionally simple
  // and does NOT subtract allowable expenses (parking, tolls, etc.) - that
  // calculation lives in the premium Self Assessment wizard.
  const taxableProfitPence = Math.max(0, grossEarningsPence - mileageDeductionPence);

  // Marginal-rate aware: if the user has declared other income (main job
  // salary, pension etc.) the income-tax portion is calculated as the tax
  // due on (other + profit) minus the tax due on `other` alone, so the
  // estimate reflects their real bracket. NI portions stay bound to profit.
  const taxEstimate = estimateUkTax(taxableProfitPence, {
    otherIncomePence: user?.otherAnnualIncomePence ?? null,
  });
  const grossTaxLiabilityPence =
    taxEstimate.incomeTaxPence + taxEstimate.class2NiPence + taxEstimate.class4NiPence;

  // PAYE offset (Laura Joyce 10 May 2026): for mixed PAYE+self-employed
  // users, subtract what their employer has already deducted so the
  // headline figure represents what's STILL owed, not the gross
  // liability. Floored at 0 — if PAYE has somehow over-paid we still
  // show 0 owed rather than a negative number.
  const payeAlreadyPaidPence = user?.payeAnnualPaidTaxPence ?? 0;
  const estimatedTaxPence = Math.max(
    0,
    grossTaxLiabilityPence - payeAlreadyPaidPence
  );

  const effectiveRatePercent =
    grossEarningsPence > 0
      ? Math.round((estimatedTaxPence / grossEarningsPence) * 10000) / 100
      : 0;

  // Set-aside recommendation: apply the YTD effective rate to last week's
  // gross. Self-corrects as the year progresses and the effective rate
  // becomes more accurate. Defaults to 25% (sensible basic-rate guess) for
  // new users with no YTD data yet.
  const rateForSetAside = effectiveRatePercent > 0 ? effectiveRatePercent : 25;
  const suggestedSetAsidePence = Math.round(
    (earningsLast7DaysPence * rateForSetAside) / 100
  );

  // Readiness checks. Three items, each contributes 33% (last gets 34%).
  // Keeping it small and meaningful - long checklists make people freeze.
  const primaryVehicle = vehicles.find((v) => v.isPrimary) ?? vehicles[0];
  const items: ReadinessItem[] = [
    {
      id: "profile-name",
      label: "Full name on profile",
      done: !!user?.fullName?.trim(),
      hint: "Self Assessment exports need your full legal name. Add it in Profile.",
    },
    {
      id: "primary-vehicle",
      label: "Primary vehicle with MPG",
      done:
        !!primaryVehicle &&
        ((primaryVehicle.actualMpg ?? 0) > 0 ||
          (primaryVehicle.estimatedMpg ?? 0) > 0),
      hint: !primaryVehicle
        ? "Add a vehicle in Profile so MileClear knows which AMAP rate to apply."
        : "Set MPG on your primary vehicle so fuel cost calculations are accurate.",
    },
    {
      id: "trips-classified",
      label: "All trips classified this tax year",
      done: unclassifiedCount === 0,
      hint:
        unclassifiedCount > 0
          ? `${unclassifiedCount} ${unclassifiedCount === 1 ? "trip needs" : "trips need"} classifying as business or personal.`
          : undefined,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const percentComplete = Math.round((doneCount / items.length) * 100);

  // Provenance for the mileage-deduction figure. Shows the user the exact
  // derivation: "we found N business trips totalling X miles, applied the
  // HMRC AMAP rate, here's the total". Audit item #5.
  const mileageDeductionDerivation = buildMileageDeductionDerivation({
    taxYear,
    start,
    end,
    milesByType,
    businessTripCount: businessTrips.length,
    totalDeductionPence: mileageDeductionPence,
  });

  // Cross-window comparison for the deduction. Long-press the figure to
  // see how this tax year compares to last 7 days, this month, and last
  // tax year. Layer 3 polish (premium_app_feel.md).
  const mileageDeductionAcrossWindows = await buildMileageDeductionAcrossWindows({
    userId,
    now,
    taxYear,
    thisYearTotalPence: mileageDeductionPence,
    rateOpts,
  });

  return {
    taxYear,
    taxYearEndDate: end.toISOString(),
    filingDeadline: filingDeadline.toISOString(),
    daysToFilingDeadline,
    ytd: {
      grossEarningsPence,
      // Breakdown so the dashboard can render "Gig £X · Invoices £Y" subtitle
      gigEarningsPence: earningsBasePence,
      invoiceIncomePence,
      taxBasis: userTaxBasis,
      mileageDeductionPence,
      taxableProfitPence,
      grossTaxLiabilityPence,
      payeAlreadyPaidPence,
      estimatedTaxPence,
      effectiveRatePercent,
      mileageDeductionDerivation,
      mileageDeductionAcrossWindows,
    },
    setAsideThisWeek: {
      earningsLast7DaysPence,
      suggestedSetAsidePence,
      rateUsedPercent: rateForSetAside,
    },
    readiness: {
      percentComplete,
      items,
    },
    nudges: {
      earnings: earningsNudge,
    },
  };
}

// ── Provenance helpers ──────────────────────────────────────────────

interface DerivationInput {
  taxYear: string;
  start: Date;
  end: Date;
  milesByType: Map<VehicleType, number>;
  businessTripCount: number;
  totalDeductionPence: number;
}

/**
 * Build the human-readable derivation panel for the YTD mileage deduction.
 * Audit item #5: the "why this number?" pattern.
 *
 * The derivation shows:
 *   - which trips fed into the calculation (date range, count)
 *   - the per-vehicle-type breakdown (car/van vs motorbike use different rates)
 *   - the AMAP threshold split (45p first 10k, 25p after) for car/van
 *   - the final formula and total
 *
 * Empty (no business miles) returns a derivation that still explains
 * what the figure WOULD be — that's more useful than nothing.
 */
function buildMileageDeductionDerivation(input: DerivationInput): NumberDerivation {
  const { taxYear, start, end, milesByType, businessTripCount, totalDeductionPence } = input;

  const components: NumberDerivation["components"] = [];

  // Total business miles row first — anchors the rest.
  let totalMiles = 0;
  for (const miles of milesByType.values()) totalMiles += miles;
  components.push({
    label: "Business miles in tax year",
    value: formatMiles(totalMiles),
  });

  // Per-vehicle-type breakdown. Most users only have one type (car) but
  // motorbikes use a different rate so the breakdown is necessary.
  for (const [type, miles] of milesByType) {
    if (miles <= 0) continue;
    if (type === "motorbike") {
      const rate = HMRC_RATES.motorbike.flat;
      const subtotal = Math.round(miles * rate);
      components.push({
        label: `Motorbike: ${formatMiles(miles)} × ${rate}p`,
        value: formatPence(subtotal),
      });
    } else {
      // car / van — AMAP threshold split
      const firstTier = Math.min(miles, HMRC_THRESHOLD_MILES);
      const overflow = Math.max(0, miles - HMRC_THRESHOLD_MILES);
      const tier1Pence = Math.round(firstTier * HMRC_RATES.car.first10000);
      const tier2Pence = Math.round(overflow * HMRC_RATES.car.after10000);
      const typeLabel = type === "van" ? "Van" : "Car";

      if (overflow > 0) {
        components.push({
          label: `${typeLabel}: first ${formatMiles(firstTier)} × ${HMRC_RATES.car.first10000}p`,
          value: formatPence(tier1Pence),
        });
        components.push({
          label: `${typeLabel}: remaining ${formatMiles(overflow)} × ${HMRC_RATES.car.after10000}p`,
          value: formatPence(tier2Pence),
        });
      } else {
        components.push({
          label: `${typeLabel}: ${formatMiles(miles)} × ${HMRC_RATES.car.first10000}p`,
          value: formatPence(tier1Pence),
        });
      }
    }
  }

  components.push({
    label: "Total mileage deduction",
    value: formatPence(totalDeductionPence),
    highlight: true,
  });

  // Build the formula string for the header.
  let formula: string | undefined;
  if (totalMiles > 0) {
    const parts: string[] = [];
    for (const [type, miles] of milesByType) {
      if (miles <= 0) continue;
      if (type === "motorbike") {
        parts.push(`(${formatMiles(miles)} × ${HMRC_RATES.motorbike.flat}p)`);
      } else {
        const firstTier = Math.min(miles, HMRC_THRESHOLD_MILES);
        const overflow = Math.max(0, miles - HMRC_THRESHOLD_MILES);
        if (overflow > 0) {
          parts.push(
            `(${formatMiles(firstTier)} × ${HMRC_RATES.car.first10000}p) + (${formatMiles(overflow)} × ${HMRC_RATES.car.after10000}p)`
          );
        } else {
          parts.push(`(${formatMiles(miles)} × ${HMRC_RATES.car.first10000}p)`);
        }
      }
    }
    formula = `${parts.join(" + ")} = ${formatPence(totalDeductionPence)}`;
  }

  return {
    summary: totalMiles > 0
      ? `Your tax-deductible mileage at HMRC's Approved Mileage Allowance Payment (AMAP) rate, derived from ${businessTripCount} business ${businessTripCount === 1 ? "trip" : "trips"} in tax year ${taxYear}.`
      : `No business trips classified in tax year ${taxYear} yet. Once you classify trips as business, your AMAP deduction will appear here.`,
    formula,
    components,
    sources: businessTripCount > 0 ? [{
      kind: "trips",
      count: businessTripCount,
      description: `Business trips in tax year ${taxYear}`,
      dateRange: {
        from: start.toISOString(),
        to: end.toISOString(),
      },
    }] : undefined,
    notes: [
      "AMAP rates: 45p per mile for the first 10,000 business miles, 25p per mile thereafter (cars and vans). Motorbikes are 24p flat.",
      "Trips without a linked vehicle assume car rates. Add or assign a vehicle on the Trip detail screen if a trip used a different vehicle type.",
    ],
  };
}

// ── Cross-window comparison helper ──────────────────────────────────

interface AcrossWindowsInput {
  userId: string;
  now: Date;
  taxYear: string;
  /** Already-computed deduction for the current tax year, reused so we
   *  don't redo the full aggregation. */
  thisYearTotalPence: number;
  /** Resolved mileage-rate options from the parent snapshot, so all four
   *  windows apply the same rate set the user is set up to claim under. */
  rateOpts: { customRateFirst10kPence?: number | null; customRateAfter10kPence?: number | null };
}

/**
 * Build the cross-window comparison for the YTD mileage deduction.
 * Long-press → 4 windows: last 7 days, this month, this tax year, last
 * tax year. Each window queries business trips in its date range and
 * applies AMAP rates the same way as the main snapshot.
 *
 * Layer 3 polish (premium_app_feel.md).
 */
async function buildMileageDeductionAcrossWindows(
  input: AcrossWindowsInput
): Promise<NumberAcrossWindows> {
  const { userId, now, taxYear, thisYearTotalPence, rateOpts } = input;

  // Window bounds.
  const last7DaysStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Last tax year — derive from current taxYear string e.g. "2025-26" → "2024-25".
  const [currentStartStr] = taxYear.split("-");
  const lastTaxYearStartYear = parseInt(currentStartStr, 10) - 1;
  const lastTaxYear = `${lastTaxYearStartYear}-${String(lastTaxYearStartYear + 1).slice(2)}`;
  const { start: lastTyStart, end: lastTyEnd } = parseTaxYear(lastTaxYear);

  // Query trips for the 3 windows we don't already have aggregated.
  // (This-tax-year is reused from the snapshot's pre-computed total.)
  const [last7DaysTrips, thisMonthTrips, lastTaxYearTrips] = await Promise.all([
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        isPhantomTrip: false,
        startedAt: { gte: last7DaysStart, lte: now },
      },
      select: {
        distanceMiles: true,
        vehicle: { select: { vehicleType: true } },
      },
    }),
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        isPhantomTrip: false,
        startedAt: { gte: thisMonthStart, lte: now },
      },
      select: {
        distanceMiles: true,
        vehicle: { select: { vehicleType: true } },
      },
    }),
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        isPhantomTrip: false,
        startedAt: { gte: lastTyStart, lte: lastTyEnd },
      },
      select: {
        distanceMiles: true,
        vehicle: { select: { vehicleType: true } },
      },
    }),
  ]);

  const deductionFor = (trips: { distanceMiles: number; vehicle: { vehicleType: string } | null }[]) => {
    const milesByTypeLocal = new Map<VehicleType, number>();
    for (const t of trips) {
      const type = (t.vehicle?.vehicleType ?? "car") as VehicleType;
      milesByTypeLocal.set(type, (milesByTypeLocal.get(type) ?? 0) + t.distanceMiles);
    }
    let pence = 0;
    for (const [type, miles] of milesByTypeLocal) {
      pence += calculateMileageDeduction(type, miles, rateOpts).deductionPence;
    }
    return pence;
  };

  const last7DaysPence = deductionFor(last7DaysTrips);
  const thisMonthPence = deductionFor(thisMonthTrips);
  const lastTaxYearPence = deductionFor(lastTaxYearTrips);

  return {
    label: "HMRC mileage deduction across windows",
    windows: [
      {
        key: "last7d",
        label: "Last 7 days",
        value: formatPence(last7DaysPence),
        raw: last7DaysPence,
        range: `${shortDate(last7DaysStart)} – today`,
      },
      {
        key: "thisMonth",
        label: monthLabel(now),
        value: formatPence(thisMonthPence),
        raw: thisMonthPence,
        range: `${shortDate(thisMonthStart)} – today`,
      },
      {
        key: "thisTaxYear",
        label: `Tax year ${taxYear}`,
        value: formatPence(thisYearTotalPence),
        raw: thisYearTotalPence,
        highlight: true,
      },
      {
        key: "lastTaxYear",
        label: `Tax year ${lastTaxYear}`,
        value: formatPence(lastTaxYearPence),
        raw: lastTaxYearPence,
      },
    ],
    notes: [
      "Each window applies AMAP rates fresh — the 10k threshold resets per tax year, not per window.",
    ],
  };
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "long" });
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
