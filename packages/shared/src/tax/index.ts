// Tax rules by country: regimeFor(country) gives the regime a driver's
// figures are worked out under, or null where MileClear has none yet (then
// no money figure is shown). The UK and the Crown Dependencies are HMRC.
import { isUk } from "../utils/countryFeatures.js";
import { countryOf } from "../data/countries.js";
import type { TaxRegime } from "./regime.js";
import { UK_REGIME } from "./uk.js";
import { NZ_REGIME } from "./nz.js";

export * from "./regime.js";
export * from "./uk.js";
export * from "./nz.js";
export * from "./claimView.js";
export * from "./logbook.js";
export { zonedParts, zonedMidnight } from "./zonedTime.js";

const BY_COUNTRY: Record<string, TaxRegime> = {
  NZ: NZ_REGIME,
};

export function regimeFor(country: unknown): TaxRegime | null {
  if (isUk(country)) return UK_REGIME;
  return BY_COUNTRY[countryOf(country)] ?? null;
}
