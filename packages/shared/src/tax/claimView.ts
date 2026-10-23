// Words for the claim card outside the UK (New Zealand first, 23 Oct 2026),
// shared so the app and the website say the same thing. Figures come from
// GET /tax/regime-summary; distances there are in the regime's basis (km for
// New Zealand), because the rates are per km whatever the driver's setting.
import { formatMoney, formatRatePerKm } from "../utils/money.js";
import type { RegimeSummary, RegimeVehicleSummary } from "./regime.js";

/** A question the card asks about one vehicle; the answer is saved on the
 *  vehicle (PATCH /vehicles/:id with { [field]: value }). */
export interface RegimeClaimQuestion {
  vehicleId: string;
  vehicleName: string;
  field: "nzRecordBasis" | "nzHybridKind";
  prompt: string;
  options: Array<{ label: string; value: string }>;
}

export interface RegimeClaimView {
  title: string;
  /** "$1,234.56", or null when no business distance has a figure. */
  amount: string | null;
  /** Under the amount. */
  subline: string;
  /** Which basis the figure is on (logbook or the 25% limit). */
  basisNote: string | null;
  /** Rates not out yet for this year: which year's are used, and when its own come out. */
  ratesNote: string | null;
  /** Unsorted trips this tax year: mark them to count any business ones. */
  unsortedNote: string | null;
  /** Answers the figure needs (logbook or not, which kind of hybrid). */
  questions: RegimeClaimQuestion[];
  /** One block per vehicle, for the breakdown on tap. */
  vehicles: Array<{ name: string; lines: string[] }>;
  /** How the rules work, under the breakdown. */
  notes: string[];
  a11yLabel: string;
}

// OS 19/04a paras 3-4, 8, 12, 22; OS 19/04b (partners, employees). Read 23 Oct 2026.
const NOTES: Record<string, string[]> = {
  IRD: [
    "Tier 1 covers the business share of the first 14,000 km each vehicle travels in the tax year, personal driving included. Tier 2 covers the business share of the rest.",
    "With no logbook (90 days or more) or full records, IRD limits the claim to 25%: Tier 1 on at most 3,500 business km, then Tier 2.",
    "The kilometre rate has to be chosen for each vehicle in its first year of business use, and the choice can't be changed. If you used actual costs that year, you stay on actual costs.",
    "Nothing extra for depreciation on top, and no GST on kilometre rates.",
    "This figure is for self-employed driving. It isn't for partners in a partnership, and if you're an employee, your employer reimburses you instead.",
  ],
};

export const RECORDS_PROMPT =
  "Do you keep a logbook (90 days or more) or full records of every trip for this car?";
export const HYBRID_PROMPT = "What kind of hybrid is it?";
export const HYBRID_NO_RATE_LINE = "IRD doesn't set a rate for this kind of hybrid. Check with your accountant.";

const HYBRID_OPTIONS = [
  { label: "Petrol hybrid", value: "petrol" },
  { label: "Plug-in hybrid", value: "plugin" },
  { label: "Diesel hybrid", value: "diesel" },
  { label: "Mild hybrid", value: "mild" },
];

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
      return `${s.authority}'s kilometre rates only cover petrol, diesel, petrol hybrid and electric vehicles. Check the fuel type on the vehicle; for anything else, use actual costs.`;
    case "vehicle_type_unsupported":
      return `${s.authority}'s kilometre rates don't cover motorbikes or scooters, so use actual costs.`;
    case "hybrid_kind_needed":
      return "Say what kind of hybrid it is to see a figure.";
    case "hybrid_no_rate":
      return HYBRID_NO_RATE_LINE;
    case "no_rates":
      return `There are no ${s.authority} rates for ${s.taxYear}.`;
    default:
      return "";
  }
}

export function regimeClaimView(s: RegimeSummary): RegimeClaimView {
  // A figure only when there is business driving with a rate behind it: a car
  // with no business trips would otherwise read "$0.00" (review, 23 Oct).
  const priced = s.vehicles.filter((v) => v.claim && v.businessDistance > 0);
  const has = s.businessDistance > 0 && priced.length > 0;
  const amount = has ? formatMoney(s.totalAmountMinor, s.currency) : null;
  const title = `Your claim at ${rateNoun(s.authority)}`;
  const business = distanceText(s.businessDistance, s.distanceBasis);
  const subline = amount
    ? `${business} of business driving this tax year (${s.taxYearDescription}).`
    : s.businessDistance > 0
      ? `${business} of business driving this tax year, but no figure yet. Tap to see why.`
      : `No business driving yet this tax year (${s.taxYearDescription}).`;

  const ratesNote =
    s.provisional && s.ratesYear
      ? [`Estimate at ${s.ratesYear} rates.`, s.ratesExpected].filter(Boolean).join(" ")
      : null;

  let basisNote: string | null = null;
  if (has && s.authority === "IRD") {
    const limited = priced.filter((v) => v.claim?.recordBasis && v.claim.recordBasis !== "records");
    if (limited.length === 0) basisNote = "Worked out from your logbook or full records.";
    else if (limited.length === priced.length) basisNote = "Worked out at IRD's 25% limit, as no logbook or full records are kept.";
    else basisNote = "Some vehicles are worked out at IRD's 25% limit, as no logbook or full records are kept for them.";
  }

  const unsorted = Math.round(s.unclassifiedDistance ?? 0);
  const unsortedNote =
    unsorted > 0
      ? `${distanceText(unsorted, s.distanceBasis)} not yet marked Business or Personal. Mark them to count any business ones.`
      : null;

  const questions: RegimeClaimQuestion[] = [];
  if (s.authority === "IRD") {
    for (const v of s.vehicles) {
      if (!v.vehicleId || v.businessDistance <= 0) continue;
      const vehicleName = v.name ?? "Your car";
      if (v.noClaimReason === "hybrid_kind_needed") {
        questions.push({ vehicleId: v.vehicleId, vehicleName, field: "nzHybridKind", prompt: HYBRID_PROMPT, options: HYBRID_OPTIONS });
      }
      if (v.claim && v.claim.recordBasis === "unanswered") {
        questions.push({
          vehicleId: v.vehicleId,
          vehicleName,
          field: "nzRecordBasis",
          prompt: RECORDS_PROMPT,
          options: [
            { label: "Yes", value: "records" },
            { label: "No", value: "none" },
          ],
        });
      }
    }
  }

  const vehicles = s.vehicles
    .filter((v) => v.businessDistance > 0)
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
        if (v.claim.recordBasis && v.claim.recordBasis !== "records") {
          lines.push(
            v.claim.amountWithRecordsMinor != null
              ? `At the 25% limit. With a logbook or full records it would be ${formatMoney(v.claim.amountWithRecordsMinor, s.currency)}.`
              : "At the 25% limit (no logbook or full records)."
          );
        }
      } else {
        const r = reasonLine(v, s);
        if (r) lines.push(r);
      }
      return { name, lines };
    });

  const a11yLabel = [title, amount ?? "no figure yet", subline, basisNote, ratesNote, unsortedNote].filter(Boolean).join(". ");
  return {
    title,
    amount,
    subline,
    basisNote,
    ratesNote,
    unsortedNote,
    questions,
    vehicles,
    notes: NOTES[s.authority] ?? [],
    a11yLabel,
  };
}
