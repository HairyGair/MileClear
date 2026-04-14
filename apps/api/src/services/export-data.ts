import { prisma } from "../lib/prisma.js";
import {
  HMRC_RATES,
  HMRC_THRESHOLD_MILES,
  parseTaxYear,
  calculateHmrcDeduction,
  EXPENSE_CATEGORIES,
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

  const [trips, primaryVehicle] = await Promise.all([
    prisma.trip.findMany({
      where: {
        userId: opts.userId,
        startedAt: { gte: start, lte: end },
        ...(opts.classification ? { classification: opts.classification } : {}),
      },
      include: {
        vehicle: {
          select: { make: true, model: true, vehicleType: true },
        },
      },
      orderBy: { startedAt: "asc" },
    }),
    // Fetch primary vehicle for trips without a vehicleId
    prisma.vehicle.findFirst({
      where: { userId: opts.userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { make: true, model: true, vehicleType: true },
    }),
  ]);

  // Running tally of business miles per vehicle type for HMRC rate tiers
  const businessMilesByType: Record<string, number> = {};

  return trips.map((trip) => {
    const vehicle = trip.vehicle ?? primaryVehicle;
    const vType = (vehicle?.vehicleType || "car") as VehicleType;
    const prevBusinessMiles = businessMilesByType[vType] || 0;

    let hmrcRatePence = 0;
    let deductionPence = 0;

    if (trip.classification === "business") {
      if (vType === "motorbike") {
        hmrcRatePence = HMRC_RATES.motorbike.flat;
        deductionPence = Math.round(trip.distanceMiles * hmrcRatePence);
      } else {
        const rates = HMRC_RATES[vType];
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
        businessMilesByType[vType] =
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
      vehicleType: (vehicle?.vehicleType || null) as VehicleType | null,
      vehicleName: vehicle
        ? `${vehicle.make} ${vehicle.model}`
        : null,
      hmrcRatePence,
      deductionPence,
    };
  });
}

export async function fetchExportSummary(
  userId: string,
  taxYear: string
): Promise<ExportSummary> {
  const { start, end } = parseTaxYear(taxYear);

  const [trips, earnings, user, primaryVehicle] = await Promise.all([
    prisma.trip.findMany({
      where: { userId, startedAt: { gte: start, lte: end } },
      include: {
        vehicle: {
          select: { make: true, model: true, vehicleType: true },
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
      select: { fullName: true, displayName: true, email: true },
    }),
    // Fetch primary vehicle (or first vehicle) for trips without a vehicleId
    prisma.vehicle.findFirst({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { id: true, make: true, model: true, vehicleType: true },
    }),
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
    const vKey = trip.vehicleId || (primaryVehicle ? primaryVehicle.id : "unassigned");
    const existing = vehicleMap.get(vKey);
    if (existing) {
      existing.totalMiles += trip.distanceMiles;
      if (trip.classification === "business") {
        existing.businessMiles += trip.distanceMiles;
      }
    } else {
      vehicleMap.set(vKey, {
        name: vehicle
          ? `${vehicle.make} ${vehicle.model}`
          : "Unassigned trips",
        type: (vehicle?.vehicleType || "car") as VehicleType,
        totalMiles: trip.distanceMiles,
        businessMiles:
          trip.classification === "business" ? trip.distanceMiles : 0,
      });
    }
  }

  const vehicleBreakdown: ExportVehicleBreakdown[] = [];
  let totalDeductionPence = 0;

  for (const v of vehicleMap.values()) {
    const deduction = calculateHmrcDeduction(v.type, v.businessMiles);
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
  const monthlyMap = new Map<string, { trips: number; miles: number; businessMiles: number; deductionPence: number }>();
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  for (const trip of trips) {
    const d = new Date(trip.startedAt);
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const existing = monthlyMap.get(key) || { trips: 0, miles: 0, businessMiles: 0, deductionPence: 0 };
    existing.trips += 1;
    existing.miles += trip.distanceMiles;
    if (trip.classification === "business") {
      existing.businessMiles += trip.distanceMiles;
    }
    monthlyMap.set(key, existing);
  }

  // Build ordered monthly breakdown (April → March)
  const { start: tyStart } = parseTaxYear(taxYear);
  const monthlyBreakdown: ExportMonthlyBreakdown[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(tyStart.getFullYear(), tyStart.getMonth() + i, 1);
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const data = monthlyMap.get(key);
    if (data && data.trips > 0) {
      // Calculate deduction for this month's business miles
      const deduction = calculateHmrcDeduction("car", data.businessMiles);
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
