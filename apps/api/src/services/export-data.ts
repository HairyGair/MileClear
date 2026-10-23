import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { postcodesFor } from "./postcodeLookup.js";
import { isClaimableTrip } from "../lib/claimableTrips.js";
import { odometerForExportTrips } from "./odometer.js";
import {
  HMRC_THRESHOLD_MILES,
  getHmrcRatesForTaxYear,
  getTaxYear,
  parseTaxYear,
  calculateMileageDeduction,
  EXPENSE_CATEGORIES,
  projectLabelMatches,
} from "@mileclear/shared";
import type {
  ExportTripRow,
  ExportSummary,
  ExportVehicleBreakdown,
  ExportEarningsByPlatform,
  ExportMonthlyBreakdown,
  VehicleType,
} from "@mileclear/shared";

interface FetchTripsOpts {
  userId: string;
  taxYear?: string;
  from?: Date;
  to?: Date;
  classification?: "business" | "personal";
  /** Look up each trip's start and end postcode (CSV export). */
  withPostcodes?: boolean;
  /** Add the running odometer at the start and end of each trip (CSV and PDF). */
  withOdometer?: boolean;
  /**
   * Only this car's trips. Every trip is still priced first, so the 10,000-mile
   * threshold counts the driver's business miles in ALL their cars and vans
   * (it is per person, not per car), and each row comes out exactly as it does
   * on the all-cars report. The caller must already have checked the vehicle
   * belongs to the user (resolveExportVehicle).
   */
  vehicleId?: string;
  /**
   * Only this client's trips (23 Oct 2026): the projectLabelKey of a Project /
   * client label. Priced the same way as one car: every trip first, so each
   * row keeps the price it has on the all-clients report and the 10,000-mile
   * threshold is still the driver's whole year, not 10,000 per client.
   */
  projectKey?: string;
}

/**
 * The car a trip counts against in exports: its own vehicle, or the export
 * fallback (primary, else oldest) when it has none. The same rule groups the
 * Self Assessment "Vehicle Breakdown", so a one-car report's miles equal
 * that car's row there.
 */
export function exportVehicleIdForTrip(
  tripVehicleId: string | null,
  fallbackVehicleId: string | null
): string | null {
  return tripVehicleId ?? fallbackVehicleId;
}

/** The vehicle exports fall back to for trips with no vehicle: primary, else oldest. */
function exportFallbackVehicle(userId: string) {
  return prisma.vehicle.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { id: true, make: true, model: true, vehicleType: true },
  });
}

export interface ExportVehicle {
  id: string;
  make: string;
  model: string;
  registrationPlate: string | null;
  vehicleType: string;
  /** Trips with no vehicle count against this vehicle (it is the fallback). */
  includesUnassigned: boolean;
}

/** The user's vehicle for a one-vehicle export, or null when it isn't theirs. */
export async function resolveExportVehicle(
  userId: string,
  vehicleId: string
): Promise<ExportVehicle | null> {
  const [vehicle, fallback] = await Promise.all([
    prisma.vehicle.findFirst({
      where: { id: vehicleId, userId },
      select: { id: true, make: true, model: true, registrationPlate: true, vehicleType: true },
    }),
    exportFallbackVehicle(userId),
  ]);
  if (!vehicle) return null;
  return { ...vehicle, includesUnassigned: fallback?.id === vehicle.id };
}

/** Trip where clause for one export vehicle, matching exportVehicleIdForTrip. */
export function exportVehicleTripWhere(
  v: Pick<ExportVehicle, "id" | "includesUnassigned">
): Prisma.TripWhereInput {
  return v.includesUnassigned
    ? { OR: [{ vehicleId: v.id }, { vehicleId: null }] }
    : { vehicleId: v.id };
}

export async function fetchExportTrips(
  opts: FetchTripsOpts
): Promise<ExportTripRow[]> {
  let start: Date;
  let end: Date;

  if (opts.taxYear) {
    const range = parseTaxYear(opts.taxYear);
    start = range.start;
    end = range.end;
  } else if (opts.from && opts.to) {
    start = opts.from;
    end = opts.to;
  } else {
    throw new Error("Either taxYear or from+to must be provided");
  }

  const [allTrips, primaryVehicle] = await Promise.all([
    prisma.trip.findMany({
      where: {
        userId: opts.userId,
        isPhantomTrip: false,
        startedAt: { gte: start, lte: end },
        ...(opts.classification ? { classification: opts.classification } : {}),
      },
      include: {
        vehicle: {
          select: { make: true, model: true, vehicleType: true, providedByOthers: true },
        },
      },
      orderBy: { startedAt: "asc" },
    }),
    // Fetch primary vehicle for trips without a vehicleId
    exportFallbackVehicle(opts.userId),
  ]);

  // Running tally of business miles for the HMRC rate tiers, per tax year
  // and per kind of vehicle. Cars and vans are ONE kind and share one
  // 10,000-mile threshold (EIM31240, EIM31275); each trip is priced at the
  // rates of its own tax year, and the tally restarts on 6 April. Before
  // 4 Oct 2026 every row used the newest rates (55p even for 2025-26) and
  // cars and vans each had their own 10,000.
  const businessMilesByType: Record<string, number> = {};

  const allRows: ExportTripRow[] = allTrips.map((trip) => {
    const vehicle = trip.vehicle ?? primaryVehicle;
    const vType = (vehicle?.vehicleType || "car") as VehicleType;
    const tripTaxYear = getTaxYear(new Date(trip.startedAt));
    const rateTable = getHmrcRatesForTaxYear(tripTaxYear);
    const tallyKey = `${tripTaxYear}:${vType === "motorbike" ? "motorbike" : "car"}`;
    const prevBusinessMiles = businessMilesByType[tallyKey] || 0;

    let hmrcRatePence = 0;
    let deductionPence = 0;

    // A vehicle someone else pays for keeps its row but claims nothing and
    // does not use up the 10,000-mile threshold.
    if (isClaimableTrip(trip)) {
      if (vType === "motorbike") {
        hmrcRatePence = rateTable.motorbike.flat;
        deductionPence = Math.round(trip.distanceMiles * hmrcRatePence);
      } else {
        const rates = rateTable[vType];
        // Determine effective rate based on running total
        if (prevBusinessMiles >= HMRC_THRESHOLD_MILES) {
          hmrcRatePence = rates.after10000;
          deductionPence = Math.round(trip.distanceMiles * hmrcRatePence);
        } else if (
          prevBusinessMiles + trip.distanceMiles <=
          HMRC_THRESHOLD_MILES
        ) {
          hmrcRatePence = rates.first10000;
          deductionPence = Math.round(trip.distanceMiles * hmrcRatePence);
        } else {
          // Trip straddles the threshold
          const milesAtHighRate = HMRC_THRESHOLD_MILES - prevBusinessMiles;
          const milesAtLowRate = trip.distanceMiles - milesAtHighRate;
          deductionPence = Math.round(
            milesAtHighRate * rates.first10000 +
              milesAtLowRate * rates.after10000
          );
          // Use blended rate for display
          hmrcRatePence = Math.round(deductionPence / trip.distanceMiles);
        }
        businessMilesByType[tallyKey] =
          prevBusinessMiles + trip.distanceMiles;
      }
    }

    const startDate = new Date(trip.startedAt);
    return {
      date: startDate.toLocaleDateString("en-GB"),
      startTime: startDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      endTime: trip.endedAt
        ? new Date(trip.endedAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
      startAddress: trip.startAddress,
      endAddress: trip.endAddress,
      distanceMiles: Math.round(trip.distanceMiles * 100) / 100,
      classification: trip.classification as "business" | "personal",
      platform: trip.platformTag,
      businessPurpose: trip.businessPurpose,
      projectLabel: trip.projectLabel?.trim() || null,
      vehicleType: (vehicle?.vehicleType || null) as VehicleType | null,
      vehicleName: vehicle
        ? `${vehicle.make} ${vehicle.model}${providedSuffix(trip.vehicle)}`
        : null,
      hmrcRatePence,
      deductionPence,
    };
  });

  // One car and/or one client: keep their rows only, after pricing every
  // trip (see FetchTripsOpts).
  const fallbackId = primaryVehicle?.id ?? null;
  const keep = allTrips.map(
    (t) =>
      (!opts.vehicleId || exportVehicleIdForTrip(t.vehicleId, fallbackId) === opts.vehicleId) &&
      (opts.projectKey === undefined || projectLabelMatches(t.projectLabel, opts.projectKey))
  );
  const trips = allTrips.filter((_, i) => keep[i]);
  const rows = allRows.filter((_, i) => keep[i]);

  if (opts.withOdometer && trips.length > 0) {
    const odo = await odometerForExportTrips(
      opts.userId,
      trips.map((t) => ({ id: t.id, vehicleId: t.vehicleId }))
    );
    rows.forEach((r, i) => {
      const fig = odo.get(trips[i].id);
      r.odometerStart = fig?.start ?? null;
      r.odometerEnd = fig?.end ?? null;
      r.odometerSource = fig?.source ?? null;
    });
  }

  if (opts.withPostcodes && trips.length > 0) {
    const codes = await postcodesFor(
      trips.flatMap((t) => [
        { lat: t.startLat, lng: t.startLng },
        { lat: t.endLat, lng: t.endLng },
      ])
    );
    rows.forEach((r, i) => {
      r.startPostcode = codes[2 * i];
      r.endPostcode = codes[2 * i + 1];
    });
  }
  return rows;
}

/** Marks a vehicle someone else pays for wherever an export names it. */
function providedSuffix(vehicle: { providedByOthers?: boolean } | null | undefined): string {
  return vehicle?.providedByOthers ? " (provided, not claimed)" : "";
}

export async function fetchExportSummary(
  userId: string,
  taxYear: string
): Promise<ExportSummary> {
  const { start, end } = parseTaxYear(taxYear);

  const [trips, earnings, user, primaryVehicle] = await Promise.all([
    prisma.trip.findMany({
      where: { userId, isPhantomTrip: false, startedAt: { gte: start, lte: end } },
      include: {
        vehicle: {
          select: { make: true, model: true, vehicleType: true, providedByOthers: true },
        },
      },
    }),
    prisma.earning.findMany({
      where: {
        userId,
        periodStart: { gte: start },
        periodEnd: { lte: end },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        displayName: true,
        email: true,
      },
    }),
    // Fetch primary vehicle (or first vehicle) for trips without a vehicleId
    exportFallbackVehicle(userId),
  ]);

  let totalMiles = 0;
  let businessMiles = 0;
  let personalMiles = 0;

  // Group by vehicle for breakdown
  const vehicleMap = new Map<
    string,
    {
      name: string;
      type: VehicleType;
      totalMiles: number;
      businessMiles: number;
      /** Business miles that can be claimed (not in a vehicle someone else pays for). */
      claimableMiles: number;
    }
  >();

  for (const trip of trips) {
    totalMiles += trip.distanceMiles;
    if (trip.classification === "business") {
      businessMiles += trip.distanceMiles;
    } else {
      personalMiles += trip.distanceMiles;
    }

    // For trips without a vehicle, fall back to the user's primary vehicle
    const vehicle = trip.vehicle ?? primaryVehicle;
    const vKey = exportVehicleIdForTrip(trip.vehicleId, primaryVehicle?.id ?? null) ?? "unassigned";
    const existing = vehicleMap.get(vKey);
    if (existing) {
      existing.totalMiles += trip.distanceMiles;
      if (trip.classification === "business") {
        existing.businessMiles += trip.distanceMiles;
      }
      if (isClaimableTrip(trip)) existing.claimableMiles += trip.distanceMiles;
    } else {
      vehicleMap.set(vKey, {
        name: vehicle
          ? `${vehicle.make} ${vehicle.model}${providedSuffix(trip.vehicle)}`
          : "Unassigned trips",
        type: (vehicle?.vehicleType || "car") as VehicleType,
        totalMiles: trip.distanceMiles,
        businessMiles:
          trip.classification === "business" ? trip.distanceMiles : 0,
        claimableMiles: isClaimableTrip(trip) ? trip.distanceMiles : 0,
      });
    }
  }

  // Exports price business miles at HMRC's rates, never an employer's rate.
  // The Self Assessment PDF declares the miles were driven "for my
  // self-employed trade" and prints the 55p/25p table beside the total, and
  // the trip report prices each row at those rates. Using the employer rate
  // here made the headline disagree with both (Anthony, 23 Sep 2026).
  // Employer rates stay in the in-app employee views.
  const rateOpts = {};

  const vehicleBreakdown: ExportVehicleBreakdown[] = [];
  let totalDeductionPence = 0;

  // One 10,000-mile threshold across ALL cars and vans (EIM31240/31275),
  // shared out between them by their business miles; motorbikes on their
  // own. Before 4 Oct 2026 each vehicle got its own 10,000.
  // Pools count claimable miles only: a vehicle someone else pays for shows
  // its business miles but claims nothing.
  const carVanMiles = [...vehicleMap.values()].filter((v) => v.type !== "motorbike").reduce((s, v) => s + v.claimableMiles, 0);
  const carVanDeduction = calculateMileageDeduction("car", carVanMiles, { ...rateOpts, taxYear }).deductionPence;
  const bikeMiles = [...vehicleMap.values()].filter((v) => v.type === "motorbike").reduce((s, v) => s + v.claimableMiles, 0);
  const bikeDeduction = calculateMileageDeduction("motorbike", bikeMiles, { ...rateOpts, taxYear }).deductionPence;
  for (const v of vehicleMap.values()) {
    const poolMiles = v.type === "motorbike" ? bikeMiles : carVanMiles;
    const poolDeduction = v.type === "motorbike" ? bikeDeduction : carVanDeduction;
    const deduction = poolMiles > 0 ? Math.round((poolDeduction * v.claimableMiles) / poolMiles) : 0;
    totalDeductionPence += deduction;
    vehicleBreakdown.push({
      vehicleName: v.name,
      vehicleType: v.type,
      totalMiles: Math.round(v.totalMiles * 100) / 100,
      businessMiles: Math.round(v.businessMiles * 100) / 100,
      deductionPence: deduction,
    });
  }

  // Monthly breakdown (ordered by tax year month: April → March)
  const monthlyMap = new Map<string, { trips: number; miles: number; businessMiles: number; claimableMiles: number; deductionPence: number }>();
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  for (const trip of trips) {
    const d = new Date(trip.startedAt);
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const existing = monthlyMap.get(key) || { trips: 0, miles: 0, businessMiles: 0, claimableMiles: 0, deductionPence: 0 };
    existing.trips += 1;
    existing.miles += trip.distanceMiles;
    if (trip.classification === "business") {
      existing.businessMiles += trip.distanceMiles;
    }
    if (isClaimableTrip(trip)) existing.claimableMiles += trip.distanceMiles;
    monthlyMap.set(key, existing);
  }

  // Build ordered monthly breakdown (April → March)
  const { start: tyStart } = parseTaxYear(taxYear);
  const monthlyBreakdown: ExportMonthlyBreakdown[] = [];
  // Each month's deduction is the change in the year-to-date figure, so the
  // months add up to the year once the 10,000-mile threshold is passed
  // (before 4 Oct 2026 every month was priced as if it were the first).
  let milesBefore = 0;
  for (let i = 0; i < 12; i++) {
    const d = new Date(tyStart.getFullYear(), tyStart.getMonth() + i, 1);
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const data = monthlyMap.get(key);
    if (data && data.trips > 0) {
      // Calculate deduction for this month's business miles. Trips without
      // a linked vehicle fall back to "car" rates (most common).
      const ytd = (miles: number) => calculateMileageDeduction("car", miles, { ...rateOpts, taxYear }).deductionPence;
      const deduction = ytd(milesBefore + data.claimableMiles) - ytd(milesBefore);
      milesBefore += data.claimableMiles;
      monthlyBreakdown.push({
        month: key,
        trips: data.trips,
        miles: Math.round(data.miles * 100) / 100,
        businessMiles: Math.round(data.businessMiles * 100) / 100,
        deductionPence: deduction,
      });
    }
  }

  // Earnings by platform
  const earningsMap = new Map<string, number>();
  let totalEarningsPence = 0;
  for (const e of earnings) {
    totalEarningsPence += e.amountPence;
    earningsMap.set(
      e.platform,
      (earningsMap.get(e.platform) || 0) + e.amountPence
    );
  }

  const earningsByPlatform: ExportEarningsByPlatform[] = [];
  for (const [platform, totalPence] of earningsMap) {
    earningsByPlatform.push({ platform, totalPence });
  }

  return {
    taxYear,
    totalTrips: trips.length,
    totalMiles: Math.round(totalMiles * 100) / 100,
    businessMiles: Math.round(businessMiles * 100) / 100,
    personalMiles: Math.round(personalMiles * 100) / 100,
    vehicleBreakdown,
    monthlyBreakdown,
    totalDeductionPence,
    totalEarningsPence,
    earningsByPlatform,
    generatedAt: new Date().toISOString(),
    userName: user?.fullName || user?.displayName || user?.email || "MileClear User",
  };
}

export async function fetchExpenseSummary(
  userId: string,
  taxYear: string
): Promise<{
  categories: Array<{
    category: string;
    label: string;
    totalPence: number;
    deductibleWithMileage: boolean;
  }>;
  totalAllowablePence: number;
  totalNonAllowablePence: number;
}> {
  const { start, end } = parseTaxYear(taxYear);

  const rows = await prisma.expense.groupBy({
    by: ["category"],
    where: {
      userId,
      date: { gte: start, lt: end },
    },
    _sum: { amountPence: true },
  });

  type ExpenseCategoryKey = typeof EXPENSE_CATEGORIES[number]["value"];
  const categoryMeta = new Map<ExpenseCategoryKey, { label: string; deductibleWithMileage: boolean }>(
    EXPENSE_CATEGORIES.map((c) => [c.value, { label: c.label, deductibleWithMileage: c.deductibleWithMileage }])
  );

  let totalAllowablePence = 0;
  let totalNonAllowablePence = 0;

  const categories = rows.map((row) => {
    const meta = categoryMeta.get(row.category as ExpenseCategoryKey);
    const totalPence = row._sum.amountPence ?? 0;
    const deductibleWithMileage = meta?.deductibleWithMileage ?? false;
    if (deductibleWithMileage) {
      totalAllowablePence += totalPence;
    } else {
      totalNonAllowablePence += totalPence;
    }
    return {
      category: row.category,
      label: meta?.label ?? row.category,
      totalPence,
      deductibleWithMileage,
    };
  });

  return { categories, totalAllowablePence, totalNonAllowablePence };
}
