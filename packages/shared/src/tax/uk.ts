// The UK regime: HMRC Approved Mileage Allowance Payments. A thin wrapper over
// the existing functions, so it gives exactly what they give. UK screens and
// services still call getTaxYear / parseTaxYear / calculateMileageDeduction
// directly; this exists so country-aware code can treat the UK like any other.
import {
  calculateMileageDeduction,
  getTaxYear,
  parseTaxYear,
} from "../utils/index.js";
import { HMRC_THRESHOLD_MILES } from "../constants/index.js";
import { featuresFor } from "../utils/countryFeatures.js";
import type { MileageClaimInput, MileageClaimResult, TaxRegime } from "./regime.js";
import { startYearOfPairLabel } from "./regime.js";

function vehicleTypeOf(v: MileageClaimInput["vehicleType"]): "car" | "van" | "motorbike" {
  return v === "van" || v === "motorbike" ? v : "car";
}

export const UK_REGIME: TaxRegime = {
  id: "uk-hmrc",
  authority: "HMRC",
  country: "GB",
  currency: "GBP",
  distanceBasis: "miles",
  timeZone: "Europe/London",
  taxYearDescription: "6 April to 5 April",
  // The existing function reads the date in the process's local time, which
  // is UK time on the server. Kept as it is so nothing changes.
  taxYearOf: (date) => getTaxYear(date),
  taxYearRange: (label) => parseTaxYear(label),
  isTaxYearLabel: (label) => startYearOfPairLabel(label) != null,
  mileageClaim(input): MileageClaimResult {
    const vehicleType = vehicleTypeOf(input.vehicleType);
    const r = calculateMileageDeduction(vehicleType, input.businessDistance, { taxYear: input.taxYear });
    const miles = input.businessDistance;
    const tiers =
      vehicleType === "motorbike" || r.rateFirst10kPence === r.rateAfter10kPence
        ? [{ label: "All business miles", distance: miles, rateMinor: r.rateFirst10kPence, amountMinor: r.deductionPence }]
        : [
            {
              label: "First 10,000 miles",
              distance: Math.min(miles, HMRC_THRESHOLD_MILES),
              rateMinor: r.rateFirst10kPence,
              amountMinor: Math.round(Math.min(miles, HMRC_THRESHOLD_MILES) * r.rateFirst10kPence),
            },
            {
              label: "Over 10,000 miles",
              distance: Math.max(0, miles - HMRC_THRESHOLD_MILES),
              rateMinor: r.rateAfter10kPence,
              amountMinor: Math.round(Math.max(0, miles - HMRC_THRESHOLD_MILES) * r.rateAfter10kPence),
            },
          ];
    return {
      ok: true,
      claim: {
        amountMinor: r.deductionPence,
        currency: "GBP",
        tiers,
        ratesYear: input.taxYear ?? "latest",
        provisional: false,
      },
    };
  },
  features: featuresFor("GB"),
};
