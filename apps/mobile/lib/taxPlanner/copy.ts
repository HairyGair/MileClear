// Words for the tax bill planner screen (app/tax-planner.tsx). Pure, unit
// tested (lib/__tests__/taxPlannerCopy.test.ts). Type-only imports from
// shared, so the tests run without a built package.
//
// Plain words: "payment on account" is HMRC's own term and appears on the
// driver's statement, so it stays, with a one-line explanation on screen.

import type {
  TaxPlannerBillSource,
  TaxPlannerNoPoaReason,
  TaxPlannerPart,
  TaxPlannerPayment,
} from "@mileclear/shared";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2027-01-31" -> "31 January 2027". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function daysAwayLabel(days: number): string {
  if (days <= 0) return "Due today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  const weeks = Math.floor(days / 7);
  if (days < 63) return `In ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  const months = Math.round(days / 30.4);
  return `In ${months} months`;
}

/** "2025-26" -> "2024-25". */
export function previousTaxYear(taxYear: string): string {
  const start = parseInt(taxYear.slice(0, 4), 10) - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export function partLabel(part: Pick<TaxPlannerPart, "kind" | "taxYear">): string {
  if (part.kind === "balancing") return `Rest of your ${part.taxYear} bill`;
  if (part.kind === "poa1") return `1st payment on account for ${part.taxYear}`;
  return `2nd payment on account for ${part.taxYear}`;
}

/** One line under a payment explaining what the part is. */
export function partHint(part: TaxPlannerPart): string | null {
  if (part.kind === "balancing") {
    if (part.overpaidPence && part.overpaidPence > 0) {
      return "Your payments on account came to more than the bill, so there's nothing left to pay. HMRC pays the extra back or takes it off your next payment.";
    }
    return "The balancing payment: the bill less anything already paid on account.";
  }
  if (part.amountPence === 0 && part.noPoaReason) {
    return noPoaText(part.noPoaReason, previousTaxYear(part.taxYear));
  }
  return `An advance towards ${part.taxYear}, half of your ${previousTaxYear(part.taxYear)} bill.`;
}

export function noPoaText(reason: TaxPlannerNoPoaReason, basedOnTaxYear: string): string {
  switch (reason) {
    case "under_threshold":
      return `Nothing in advance: your ${basedOnTaxYear} bill was under £1,000.`;
    case "mostly_deducted_at_source":
      return `Nothing in advance: more than 80% of your ${basedOnTaxYear} tax was taken through PAYE.`;
    case "no_bill":
      return `Nothing in advance: there was no self-employed bill for ${basedOnTaxYear}.`;
  }
}

export function sourceLabel(source: TaxPlannerBillSource, taxYear: string): string {
  switch (source) {
    case "entered":
      return "The figure you entered";
    case "estimate":
      return "From what you've recorded in MileClear";
    case "projection":
      return "Your pace so far, carried on to 5 April";
    case "not_self_employed":
      return "Before you worked for yourself";
    case "assumed_same": {
      const start = parseInt(taxYear.slice(0, 4), 10) + 1;
      return `Nothing recorded, so taken to match ${start}-${String(start + 1).slice(2)}`;
    }
    case "unknown":
      return `No earnings recorded for ${taxYear}`;
  }
}

/** Headline for the first payment that has money in it. */
export function nextPayment(payments: TaxPlannerPayment[]): TaxPlannerPayment | null {
  return payments.find((p) => p.amountPence == null || p.amountPence > 0) ?? null;
}
