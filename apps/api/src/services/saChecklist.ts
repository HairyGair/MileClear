// "Ready for 31 January?" Self Assessment checklist (2 Oct 2026).
//
// From 1 December to 31 January a self-employed driver sees a short personal
// list answering "am I ready for my Self Assessment by 31 January?", for the
// tax year that deadline is for (the one that ended the April before:
// 31 January 2027 is for 2025-26, priced at 45p/25p for a car).
//
// It builds on what already exists rather than repeating it:
//   - the figures match the Self Assessment walkthrough and the PDF
//     (/self-assessment/summary, /exports/self-assessment): business miles
//     per vehicle at HMRC's rates for that tax year, trips with no vehicle
//     counted against the primary vehicle, earnings by period inside the
//     year, expenses split by deductibleWithMileage;
//   - "opened the walkthrough" is the self_assessment.summary event that
//     route already logs with the tax year;
//   - the PDF stays Pro and is shown as the last, optional step.
//
// Everything here is aggregate queries (groupBy / aggregate), never trip
// rows. The rules are pure functions so they can be tested without a
// database; buildSaChecklist is the whole of the status logic.

import { prisma } from "../lib/prisma.js";
import {
  calculateMileageDeduction,
  formatPence,
  parseTaxYear,
  saReturnTaxYear,
  saFilingDeadline,
  daysUntilSaDeadline,
  isSaCountdownSeason,
  taxYearRangeLabel,
  EXPENSE_CATEGORIES,
  type SaChecklist,
  type SaChecklistItem,
  type VehicleType,
} from "@mileclear/shared";

/** Logged by GET /self-assessment/summary with { taxYear }. */
export const SA_WALKTHROUGH_EVENT = "self_assessment.summary";

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

export interface TripBucket {
  vehicleId: string | null;
  classification: string;
  miles: number;
  count: number;
}

export interface ChecklistVehicle {
  id: string;
  make: string;
  model: string;
  vehicleType: string;
  createdAt: Date;
  /** Someone else pays for it: its business miles count but claim nothing. */
  providedByOthers?: boolean;
}

function isVehicleType(v: string): v is VehicleType {
  return v === "car" || v === "van" || v === "motorbike";
}

/**
 * Business miles and the mileage claim, the way the Self Assessment PDF and
 * walkthrough work them out: per vehicle, HMRC's rates for the tax year
 * (never an employer's rate: SA103 is the self-employment form), trips with
 * no vehicle counted against the primary vehicle (the first in `vehicles`,
 * which the caller orders primary first, then oldest).
 */
export function mileageByVehicle(
  buckets: TripBucket[],
  vehicles: ChecklistVehicle[],
  taxYear: string
): {
  businessMiles: number;
  businessTrips: number;
  mileageClaimPence: number;
  /** Trips (any classification) per vehicle id, after the primary fallback. */
  tripsByVehicle: Map<string, number>;
} {
  const primary = vehicles[0] ?? null;
  const typeById = new Map(vehicles.map((v) => [v.id, v.vehicleType]));
  const providedIds = new Set(vehicles.filter((v) => v.providedByOthers).map((v) => v.id));
  const businessByKey = new Map<string, { type: VehicleType; miles: number }>();
  const tripsByVehicle = new Map<string, number>();
  let businessMiles = 0;
  let businessTrips = 0;

  for (const b of buckets) {
    const key = b.vehicleId ?? primary?.id ?? "unassigned";
    tripsByVehicle.set(key, (tripsByVehicle.get(key) ?? 0) + b.count);
    if (b.classification !== "business") continue;
    businessMiles += b.miles;
    businessTrips += b.count;
    // Trips with no vehicle stay claimable, as in lib/claimableTrips.ts.
    if (b.vehicleId && providedIds.has(b.vehicleId)) continue;
    const rawType = typeById.get(key) ?? "car";
    const type: VehicleType = isVehicleType(rawType) ? rawType : "car";
    const row = businessByKey.get(key) ?? { type, miles: 0 };
    row.miles += b.miles;
    businessByKey.set(key, row);
  }

  let mileageClaimPence = 0;
  for (const row of businessByKey.values()) {
    mileageClaimPence += calculateMileageDeduction(row.type, row.miles, { taxYear }).deductionPence;
  }
  return { businessMiles, businessTrips, mileageClaimPence, tripsByVehicle };
}

export interface SaChecklistInput {
  taxYear: string;
  now: Date;
  /** Admin preview: treat today as inside the season. */
  forceSeason?: boolean;
  user: {
    fullName: string | null;
    dashboardMode: string;
    workType: string;
  };
  buckets: TripBucket[];
  /** Ordered primary first, then oldest. */
  vehicles: ChecklistVehicle[];
  earnings: { totalPence: number; count: number };
  expenses: { allowablePence: number; count: number };
  walkthroughOpened: boolean;
}

function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

function milesText(miles: number): string {
  const m = Math.round(miles);
  return `${m.toLocaleString("en-GB")} ${m === 1 ? "mile" : "miles"}`;
}

function vehicleName(v: ChecklistVehicle): string {
  return `${v.make} ${v.model}`.trim() || "vehicle";
}

/** The whole checklist: figures, each item's status and wording, headline. */
export function buildSaChecklist(input: SaChecklistInput): SaChecklist {
  const { taxYear, now } = input;
  const { end } = parseTaxYear(taxYear);
  const miles = mileageByVehicle(input.buckets, input.vehicles, taxYear);
  const unclassified = input.buckets.filter((b) => b.classification === "unclassified");
  const unclassifiedTrips = unclassified.reduce((n, b) => n + b.count, 0);
  const unclassifiedMiles = unclassified.reduce((n, b) => n + b.miles, 0);
  const totalTrips = input.buckets.reduce((n, b) => n + b.count, 0);

  const items: SaChecklistItem[] = [];

  // 1. Trips sorted
  if (totalTrips === 0) {
    items.push({
      id: "trips_sorted",
      status: "attention",
      title: "Trips logged",
      detail: `No trips logged between ${taxYearRangeLabel(taxYear)}. If you drove for work then, add those journeys so the miles count.`,
      action: "add_trip",
      actionLabel: "Add a past trip",
    });
  } else if (unclassifiedTrips > 0) {
    items.push({
      id: "trips_sorted",
      status: "attention",
      title: "Trips sorted",
      detail: `${plural(unclassifiedTrips, "trip")} (${milesText(unclassifiedMiles)}) from ${taxYear} still ${unclassifiedTrips === 1 ? "needs" : "need"} sorting into business or personal. Only business trips count towards your mileage claim.`,
      action: "unclassified_trips",
      actionLabel: "Sort trips",
    });
  } else {
    items.push({
      id: "trips_sorted",
      status: "done",
      title: "Trips sorted",
      detail: `Every trip from ${taxYear} is sorted into business or personal.`,
      action: null,
      actionLabel: null,
    });
  }

  // 2. Mileage claim
  if (miles.businessMiles > 0) {
    items.push({
      id: "mileage_claim",
      status: "done",
      title: "Mileage claim",
      detail: `${milesText(miles.businessMiles)} of business driving, worth ${formatPence(miles.mileageClaimPence)} at HMRC's mileage rates for ${taxYear}.`,
      action: null,
      actionLabel: null,
    });
  } else {
    const next =
      unclassifiedTrips > 0
        ? " Sort your trips and the business ones will count here."
        : totalTrips > 0
          ? " If any of your trips were for work, mark them as business."
          : "";
    items.push({
      id: "mileage_claim",
      status: "attention",
      title: "Mileage claim",
      detail: `No business miles for ${taxYear} yet.${next}`,
      action: unclassifiedTrips > 0 ? "unclassified_trips" : totalTrips === 0 ? "add_trip" : null,
      actionLabel: unclassifiedTrips > 0 ? "Sort trips" : totalTrips === 0 ? "Add a past trip" : null,
    });
  }

  // 3. Earnings
  items.push(
    input.earnings.count > 0
      ? {
          id: "earnings",
          status: "done",
          title: "Earnings",
          detail: `${formatPence(input.earnings.totalPence)} of earnings logged for ${taxYear}.`,
          action: "earnings",
          actionLabel: "Check earnings",
        }
      : {
          id: "earnings",
          status: "attention",
          title: "Earnings",
          detail: `No earnings logged for ${taxYear}. Your return needs your total takings, so add them from your platform statements.`,
          action: "earnings",
          actionLabel: "Add earnings",
        }
  );

  // 4. Expenses (optional: plenty of drivers have none beyond mileage)
  items.push(
    input.expenses.count > 0
      ? {
          id: "expenses",
          status: "done",
          title: "Expenses",
          detail:
            input.expenses.allowablePence > 0
              ? `${formatPence(input.expenses.allowablePence)} of expenses you can claim on top of your mileage.`
              : "Your expenses so far are things the mileage rate already covers, like fuel and insurance. Parking, tolls and phone costs can be added on top.",
          action: "expenses",
          actionLabel: "Check expenses",
        }
      : {
          id: "expenses",
          status: "optional",
          title: "Expenses",
          detail:
            "None logged. Parking, tolls and phone costs can be claimed on top of mileage. Fuel and insurance can't, as the mileage rate covers them.",
          action: "expenses",
          actionLabel: "Add expenses",
        }
  );

  // 5. Vehicles
  if (input.vehicles.length === 0) {
    items.push({
      id: "vehicles",
      status: "attention",
      title: "Vehicle",
      detail: "No vehicle added, so your miles are priced as a car. Add the vehicle you drove so the right rate is used.",
      action: "vehicles",
      actionLabel: "Add vehicle",
    });
  } else {
    const ownedInYear = input.vehicles.filter((v) => v.createdAt.getTime() <= end.getTime());
    const unused = ownedInYear.filter((v) => !miles.tripsByVehicle.get(v.id));
    const anyUsed = ownedInYear.some((v) => (miles.tripsByVehicle.get(v.id) ?? 0) > 0);
    if (input.vehicles.length > 1 && anyUsed && unused.length > 0) {
      const first = unused[0];
      const more = unused.length > 1 ? ` and ${plural(unused.length - 1, "other vehicle")}` : "";
      items.push({
        id: "vehicles",
        status: "optional",
        title: "Vehicles",
        detail: `Your ${vehicleName(first)}${more} ${unused.length === 1 ? "has" : "have"} no trips in ${taxYear}. If you used ${unused.length === 1 ? "it" : "them"} for work, add those trips.`,
        action: "vehicles",
        actionLabel: "Check vehicles",
      });
    } else {
      items.push({
        id: "vehicles",
        status: "done",
        title: input.vehicles.length === 1 ? "Vehicle" : "Vehicles",
        detail:
          input.vehicles.length === 1
            ? `Your miles are priced for your ${vehicleName(input.vehicles[0])}.`
            : `Your miles are priced for each of your ${input.vehicles.length} vehicles.`,
        action: null,
        actionLabel: null,
      });
    }
  }

  // 6. Full name (prints on the Self Assessment summary)
  items.push(
    input.user.fullName?.trim()
      ? {
          id: "full_name",
          status: "done",
          title: "Your full name",
          detail: "Set. It prints on your Self Assessment summary.",
          action: null,
          actionLabel: null,
        }
      : {
          id: "full_name",
          status: "attention",
          title: "Your full name",
          detail: "Add your full name. It prints on your Self Assessment summary.",
          action: "profile_name",
          actionLabel: "Add name",
        }
  );

  // 7. Walkthrough (free)
  items.push(
    input.walkthroughOpened
      ? {
          id: "walkthrough",
          status: "done",
          title: "Box-by-box walkthrough",
          detail: `You've been through which box each ${taxYear} figure goes in.`,
          action: "self_assessment",
          actionLabel: "Open again",
        }
      : {
          id: "walkthrough",
          status: "attention",
          title: "Box-by-box walkthrough",
          detail: "See which box on your return each figure goes in. Free, and it takes a few minutes.",
          action: "self_assessment",
          actionLabel: "Start",
        }
  );

  // 8. PDF (Pro). Always the last step, never counted as a gap.
  items.push({
    id: "pdf",
    status: "optional",
    title: "Printable summary (PDF)",
    detail: `Your ${taxYear} figures box by box, to keep or hand to your accountant.`,
    action: "sa_pdf",
    actionLabel: "Download PDF",
  });

  const attentionCount = items.filter((i) => i.status === "attention").length;
  const daysToDeadline = daysUntilSaDeadline(now, taxYear);

  let ineligibleReason: SaChecklist["ineligibleReason"] = null;
  if (input.user.workType === "employee") ineligibleReason = "employee";
  else if (input.user.dashboardMode === "personal" && miles.businessMiles === 0) ineligibleReason = "personal_only";

  return {
    taxYear,
    taxYearLabel: taxYearRangeLabel(taxYear),
    deadline: saFilingDeadline(taxYear).toISOString(),
    daysToDeadline,
    inSeason: !!input.forceSeason || isSaCountdownSeason(now),
    eligible: ineligibleReason === null,
    ineligibleReason,
    businessMiles: Math.round(miles.businessMiles * 10) / 10,
    businessTrips: miles.businessTrips,
    mileageClaimPence: miles.mileageClaimPence,
    unclassifiedTrips,
    unclassifiedMiles: Math.round(unclassifiedMiles * 10) / 10,
    earningsPence: input.earnings.totalPence,
    earningsCount: input.earnings.count,
    allowableExpensesPence: input.expenses.allowablePence,
    expenseCount: input.expenses.count,
    items,
    attentionCount,
    headline: buildHeadline(attentionCount, daysToDeadline, taxYear),
  };
}

export function buildHeadline(attentionCount: number, days: number, taxYear: string): string {
  if (attentionCount === 0) return `Everything on your ${taxYear} list is done`;
  const things = attentionCount === 1 ? "1 thing" : `${attentionCount} things`;
  if (days < 0) return `${things} still to sort for ${taxYear}`;
  return `${things} to sort before 31 January`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const ALLOWABLE_CATEGORIES = new Set<string>(
  EXPENSE_CATEGORIES.filter((c) => c.deductibleWithMileage).map((c) => c.value)
);

export async function loadSaChecklist(
  userId: string,
  opts: { now?: Date; forceSeason?: boolean } = {}
): Promise<SaChecklist | null> {
  const now = opts.now ?? new Date();
  const taxYear = saReturnTaxYear(now);
  const { start, end } = parseTaxYear(taxYear);

  const [user, vehicles, tripGroups, earnings, expenseGroups, walkthroughEvents] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, dashboardMode: true, workType: true },
    }),
    prisma.vehicle.findMany({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { id: true, make: true, model: true, vehicleType: true, createdAt: true, providedByOthers: true },
    }),
    prisma.trip.groupBy({
      by: ["vehicleId", "classification"],
      where: { userId, isPhantomTrip: false, startedAt: { gte: start, lte: end } },
      _sum: { distanceMiles: true },
      _count: { _all: true },
    }),
    // Same window as the walkthrough: the whole earning period inside the year.
    prisma.earning.aggregate({
      where: { userId, periodStart: { gte: start }, periodEnd: { lte: end } },
      _sum: { amountPence: true },
      _count: { _all: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { userId, date: { gte: start, lt: end } },
      _sum: { amountPence: true },
      _count: { _all: true },
    }),
    // A user's own rows only (userId index), no ORDER BY on a JSON select.
    prisma.appEvent.findMany({
      where: { userId, type: SA_WALKTHROUGH_EVENT, createdAt: { gte: start } },
      select: { metadata: true },
      take: 500,
    }),
  ]);
  if (!user) return null;

  let allowablePence = 0;
  let expenseCount = 0;
  for (const g of expenseGroups) {
    expenseCount += g._count._all;
    if (ALLOWABLE_CATEGORIES.has(g.category)) allowablePence += g._sum.amountPence ?? 0;
  }

  const walkthroughOpened = walkthroughEvents.some((e) => {
    const m = e.metadata as { taxYear?: unknown } | null;
    return !!m && typeof m === "object" && m.taxYear === taxYear;
  });

  return buildSaChecklist({
    taxYear,
    now,
    forceSeason: opts.forceSeason,
    user,
    buckets: tripGroups.map((g) => ({
      vehicleId: g.vehicleId,
      classification: g.classification,
      miles: g._sum.distanceMiles ?? 0,
      count: g._count._all,
    })),
    vehicles,
    earnings: { totalPence: earnings._sum.amountPence ?? 0, count: earnings._count._all },
    expenses: { allowablePence, count: expenseCount },
    walkthroughOpened,
  });
}
