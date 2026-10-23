// A driver's mileage claim under their country's tax rules, for countries
// other than the UK (New Zealand first, 23 Oct 2026). UK figures keep coming
// from the existing HMRC services; this only serves regimes added through
// regimeFor() in shared.
//
// Per vehicle, because New Zealand's 14,000 km tier counts all the travel of
// one vehicle (business and private) in the tax year. Trips with no vehicle go
// on the driver's default vehicle (primary, or the only one), like the UK
// summary; none are written back here.
import {
  milesToKm,
  type MileageClaim,
  type RegimeSummary,
  type RegimeVehicleSummary,
  type TaxRegime,
} from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { defaultVehicleIdForUser } from "./vehicleDefaults.js";

/** One trip, or (from the database) the summed miles of a vehicle + classification group. */
export interface SummaryTrip {
  distanceMiles: number;
  classification: string;
  vehicleId: string | null;
}

export interface SummaryVehicle {
  id: string;
  make: string;
  model: string;
  fuelType: string;
  vehicleType: string;
  providedByOthers: boolean;
  /** New Zealand answers (null = not answered yet). */
  nzRecordBasis?: string | null;
  nzHybridKind?: string | null;
}

function recordBasisOf(v: SummaryVehicle | null): "records" | "none" | null {
  return v?.nzRecordBasis === "records" || v?.nzRecordBasis === "none" ? v.nzRecordBasis : null;
}

function toBasis(miles: number, regime: TaxRegime): number {
  return regime.distanceBasis === "km" ? milesToKm(miles) : miles;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Pure: the summary from already-loaded trips and vehicles. */
export function buildRegimeSummary(args: {
  regime: TaxRegime;
  taxYear: string;
  trips: SummaryTrip[];
  vehicles: SummaryVehicle[];
  defaultVehicleId: string | null;
}): RegimeSummary {
  const { regime, taxYear, trips, vehicles, defaultVehicleId } = args;
  const range = regime.taxYearRange(taxYear);
  const byId = new Map(vehicles.map((v) => [v.id, v]));

  // Group in miles (stored), convert once per group so rounding doesn't add up.
  const groups = new Map<string | null, { business: number; total: number }>();
  let unclassifiedMiles = 0;
  for (const t of trips) {
    // Trips with no vehicle (and any whose vehicle id isn't the driver's) go
    // on the default vehicle, like the UK summary. Limitation: a deleted
    // vehicle's trips (the FK nulls vehicleId) land on today's default
    // vehicle, so its fuel type and 14,000 km tier are used for them. The UK
    // summary has the same behaviour; kept so the two agree.
    let vid = t.vehicleId && byId.has(t.vehicleId) ? t.vehicleId : null;
    if (vid == null && defaultVehicleId && byId.has(defaultVehicleId)) vid = defaultVehicleId;
    const g = groups.get(vid) ?? { business: 0, total: 0 };
    g.total += t.distanceMiles;
    if (t.classification === "business") g.business += t.distanceMiles;
    if (t.classification === "unclassified") unclassifiedMiles += t.distanceMiles;
    groups.set(vid, g);
  }

  const rows: RegimeVehicleSummary[] = [];
  let totalAmountMinor = 0;
  let business = 0;
  let total = 0;
  let ratesYear: string | null = null;
  let provisional = false;
  let someWithoutFigure = false;

  for (const [vid, g] of groups) {
    const v = vid ? byId.get(vid)! : null;
    const businessDistance = toBasis(g.business, regime);
    const totalDistance = toBasis(g.total, regime);
    business += businessDistance;
    total += totalDistance;

    let claim: MileageClaim | null = null;
    let noClaimReason: RegimeVehicleSummary["noClaimReason"] = null;
    if (!v) noClaimReason = "no_vehicle";
    else if (v.providedByOthers) noClaimReason = "provided_by_others";
    else {
      const r = regime.mileageClaim({
        businessDistance,
        totalDistance,
        fuelType: v.fuelType,
        vehicleType: v.vehicleType,
        taxYear,
        recordBasis: recordBasisOf(v),
        hybridKind: v.nzHybridKind ?? null,
      });
      if (r.ok) claim = r.claim;
      else noClaimReason = r.reason;
    }

    if (claim) {
      totalAmountMinor += claim.amountMinor;
      ratesYear = claim.ratesYear;
      provisional = provisional || claim.provisional;
    } else if (businessDistance > 0 && noClaimReason !== "provided_by_others") {
      someWithoutFigure = true;
    }

    rows.push({
      vehicleId: v?.id ?? null,
      name: v ? `${v.make} ${v.model}`.trim() : null,
      fuelType: v?.fuelType ?? null,
      recordBasis: recordBasisOf(v),
      hybridKind: v?.nzHybridKind ?? null,
      businessDistance: round1(businessDistance),
      totalDistance: round1(totalDistance),
      claim,
      noClaimReason,
    });
  }

  rows.sort((a, b) => b.businessDistance - a.businessDistance);

  return {
    regime: regime.id,
    authority: regime.authority,
    country: regime.country,
    currency: regime.currency,
    distanceBasis: regime.distanceBasis,
    taxYear,
    taxYearDescription: regime.taxYearDescription,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    totalAmountMinor,
    businessDistance: round1(business),
    totalDistance: round1(total),
    unclassifiedDistance: round1(toBasis(unclassifiedMiles, regime)),
    ratesYear,
    provisional,
    ratesExpected: provisional ? (regime.ratesExpected?.(taxYear) ?? null) : null,
    someWithoutFigure,
    vehicles: rows,
  };
}

/** Loads the driver's trips and vehicles for the tax year and builds the summary. */
export async function loadRegimeSummary(userId: string, regime: TaxRegime, taxYear: string): Promise<RegimeSummary> {
  const { start, end } = regime.taxYearRange(taxYear);
  // One summed row per vehicle and classification, not every trip: a full-time
  // driver can have thousands in a tax year.
  const [grouped, vehicles, defaultVehicleId] = await Promise.all([
    prisma.trip.groupBy({
      by: ["vehicleId", "classification"],
      where: { userId, isPhantomTrip: false, startedAt: { gte: start, lte: end } },
      _sum: { distanceMiles: true },
    }),
    prisma.vehicle.findMany({
      where: { userId },
      select: {
        id: true,
        make: true,
        model: true,
        fuelType: true,
        vehicleType: true,
        providedByOthers: true,
        nzRecordBasis: true,
        nzHybridKind: true,
      },
    }),
    defaultVehicleIdForUser(userId),
  ]);
  const trips: SummaryTrip[] = grouped.map((g) => ({
    vehicleId: g.vehicleId,
    classification: g.classification,
    distanceMiles: g._sum.distanceMiles ?? 0,
  }));
  return buildRegimeSummary({ regime, taxYear, trips, vehicles, defaultVehicleId });
}
