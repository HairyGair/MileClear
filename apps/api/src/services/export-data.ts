import { prisma } from "../lib/prisma.js";
import {
  HMRC_RATES,
  HMRC_THRESHOLD_MILES,
  parseTaxYear,
  calculateHmrcDeduction,
} from "@mileclear/shared";
import type {
  ExportTripRow,
  ExportSummary,
  ExportVehicleBreakdown,
  ExportEarningsByPlatform,
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

  const trips = await prisma.trip.findMany({
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
  });

  // Running tally of business miles per vehicle type for HMRC rate tiers
  const businessMilesByType: Record<string, number> = {};

  return trips.map((trip) => {
    const vType = (trip.vehicle?.vehicleType || "car") as VehicleType;
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
      vehicleType: trip.vehicle?.vehicleType as VehicleType | null,
      vehicleName: trip.vehicle
        ? `${trip.vehicle.make} ${trip.vehicle.model}`
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

  const [trips, earnings, user] = await Promise.all([
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
      select: { displayName: true, email: true },
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

    const vKey = trip.vehicleId || "unknown";
    const existing = vehicleMap.get(vKey);
    if (existing) {
      existing.totalMiles += trip.distanceMiles;
      if (trip.classification === "business") {
        existing.businessMiles += trip.distanceMiles;
      }
    } else {
      vehicleMap.set(vKey, {
        name: trip.vehicle
          ? `${trip.vehicle.make} ${trip.vehicle.model}`
          : "Unknown vehicle",
        type: (trip.vehicle?.vehicleType || "car") as VehicleType,
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
    totalDeductionPence,
    totalEarningsPence,
    earningsByPlatform,
    generatedAt: new Date().toISOString(),
    userName: user?.displayName || user?.email || "MileClear User",
  };
}
