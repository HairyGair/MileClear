// Words for the claim card outside the UK (New Zealand first, 23 Oct 2026),
// shared so the app and the website say the same thing. Figures come from
// GET /tax/regime-summary; distances there are in the regime's basis (km for
// New Zealand), because the rates are per km whatever the driver's setting.
import { formatMoney, formatRatePerKm } from "../utils/money.js";
import type { RegimeSummary, RegimeVehicleSummary } from "./regime.js";

export interface RegimeClaimView {
  title: string;
  /** "$1,234.56", or null when no business distance has a figure. */
  amount: string | null;
  /** Under the amount. */
  subline: string;
  /** Rates not out yet for this year: which year's are used. */
  ratesNote: string | null;
  /** One block per vehicle, for the breakdown on tap. */
  vehicles: Array<{ name: string; lines: string[] }>;
  /** How the tiers work, under the breakdown. */
  footnote: string | null;
  a11yLabel: string;
}

const FOOTNOTES: Record<string, string> = {
  IRD:
    "Tier 1 covers the business share of the first 14,000 km each vehicle travels in the tax year, personal driving included. Tier 2 covers the business share of the rest.",
};

function distanceText(n: number, basis: "miles" | "km"): string {
  const whole = Math.round(n).toLocaleString("en-GB");
  return basis === "km" ? `${whole} km` : `${whole} miles`;
}

function rateNoun(authority: string): string {
  return authority === "IRD" ? "IRD kilometre rates" : `${authority} rates`;
}

function reasonLine(v: RegimeVehicleSummary, s: RegimeSummary): string {
  switch (v.noClaimReason) {
    case "no_vehicle":
      return "Trips with no car on them aren't counted. Add your car to include them.";
    case "provided_by_others":
      return "Someone else pays for this vehicle, so there's no claim for it.";
    case "fuel_unknown":
      return `${s.authority} has no kilometre rate for this vehicle's fuel type.`;
    case "vehicle_type_unsupported":
      return `${s.authority}'s kilometre rates don't cover motorbikes.`;
    case "no_rates":
      return `There are no ${s.authority} rates for ${s.taxYear}.`;
    default:
      return "";
  }
}

export function regimeClaimView(s: RegimeSummary): RegimeClaimView {
  const has = s.totalAmountMinor > 0 || s.vehicles.some((v) => v.claim);
  const amount = has ? formatMoney(s.totalAmountMinor, s.currency) : null;
  const title = `Your claim at ${rateNoun(s.authority)}`;
  const business = distanceText(s.businessDistance, s.distanceBasis);
  const subline = amount
    ? `${business} of business driving this tax year (${s.taxYearDescription}).`
    : s.businessDistance > 0
      ? `${business} of business driving this tax year, but no figure yet. Tap to see why.`
      : `No business driving yet this tax year (${s.taxYearDescription}).`;
  const ratesNote =
    s.provisional && s.ratesYear ? `Using ${s.ratesYear} rates, the ${s.taxYear} rates aren't out yet.` : null;

  const vehicles = s.vehicles
    .filter((v) => v.businessDistance > 0 || v.claim)
    .map((v) => {
      const name = v.name ?? "No car";
      const lines: string[] = [
        `${distanceText(v.businessDistance, s.distanceBasis)} business of ${distanceText(v.totalDistance, s.distanceBasis)} in all`,
      ];
      if (v.claim) {
        for (const t of v.claim.tiers) {
          if (t.distance <= 0) continue;
          lines.push(
            `${t.label}: ${distanceText(t.distance, s.distanceBasis)} at ${formatRatePerKm(t.rateMinor, s.currency)} = ${formatMoney(t.amountMinor, s.currency)}`
          );
        }
      } else {
        const r = reasonLine(v, s);
        if (r) lines.push(r);
      }
      return { name, lines };
    });

  const a11yLabel = [title, amount ?? "no figure yet", subline, ratesNote].filter(Boolean).join(". ");
  return { title, amount, subline, ratesNote, vehicles, footnote: FOOTNOTES[s.authority] ?? null, a11yLabel };
}
