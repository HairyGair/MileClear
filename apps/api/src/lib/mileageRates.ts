import { calculateMileageDeduction, resolveMileageRates } from "@mileclear/shared";

// What a business trip is worth on the "to claim" screens (Home, recaps,
// scorecard, weekly analytics, Miles by project, EmSee). One rule (7 Oct
// 2026). Before this, a driver with an employer rate set had EVERY business
// trip valued at that rate, gig-app trips included, while the Self Assessment
// wizard valued them at the approved rates (demo account: £39.16 vs £53.85).
//
//  - a trip tagged with a gig platform is self-employed: approved rates
//    (Mileage Allowance Relief treats it the same way);
//  - an untagged business trip, for a driver with an employer rate set:
//    the employer's rate;
//  - a driver with no employer rate: the approved rates (most drivers).
//
// The self-employment figures (Tax tab, Self Assessment wizard and PDF,
// payment plan, P&L, accounting sync) use the approved rates on every
// business trip, never an employer's rate (Anthony, 23 Sep 2026). They do
// NOT drop untagged trips: a driver who is employed and also self-employed
// outside the gig apps has untagged self-employed trips, and the 7 Oct dry
// run showed dropping them zeroed 34 drivers' Self Assessment mileage.

export interface RateUser {
  workType: string;
  employerMileageRatePence: number | null;
  employerMileageRatePenceAfter10k: number | null;
}

export type RateOpts = ReturnType<typeof resolveMileageRates>;
type VehicleType = "car" | "van" | "motorbike";

/** The employer's rates when they apply to this driver, else null. */
export function employerRatesFor(user: RateUser | null | undefined): RateOpts | null {
  if (!user) return null;
  const r = resolveMileageRates(user);
  return r.customRateFirst10kPence != null ? r : null;
}

/** Rates to value one business trip at: the employer's for an employer
 *  trip, the approved rates ({}) otherwise. */
export function claimRatesFor(
  user: RateUser | null | undefined,
  platformTag: string | null | undefined,
): RateOpts {
  if (platformTag) return {};
  return employerRatesFor(user) ?? {};
}

export interface RatedTrip {
  distanceMiles: number;
  vehicleType: VehicleType;
  platformTag?: string | null;
}

// Cars and vans share ONE 10,000-mile threshold a year (EIM31240, EIM31275);
// motorbikes have a flat rate. Employer trips and self-employed trips are
// separate engagements, so each gets its own threshold.
function deductionFor(trips: RatedTrip[], rates: RateOpts, taxYear: string): number {
  const byType = new Map<VehicleType, number>();
  for (const t of trips) {
    const type: VehicleType = t.vehicleType === "van" ? "car" : t.vehicleType;
    byType.set(type, (byType.get(type) ?? 0) + t.distanceMiles);
  }
  let pence = 0;
  for (const [type, miles] of byType) {
    if (miles > 0) pence += calculateMileageDeduction(type, miles, { ...rates, taxYear }).deductionPence;
  }
  return pence;
}

/** What a set of claimable business trips is worth: self-employed trips at
 *  the approved rates plus employer trips at the employer's rate. The
 *  figure Home, recaps and insights show as "to claim". */
export function claimValuePence(
  trips: RatedTrip[],
  user: RateUser | null | undefined,
  taxYear: string,
): number {
  const employer = employerRatesFor(user);
  if (!employer) return deductionFor(trips, {}, taxYear);
  const selfEmployed = trips.filter((t) => !!t.platformTag);
  const employerTrips = trips.filter((t) => !t.platformTag);
  return deductionFor(selfEmployed, {}, taxYear) + deductionFor(employerTrips, employer, taxYear);
}
