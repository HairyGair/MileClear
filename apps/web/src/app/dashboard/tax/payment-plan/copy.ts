import type { TaxPlannerBillSource, TaxPlannerNoPoaReason, TaxPlannerPart, TaxPlannerPayment } from "@mileclear/shared";

// Words for the payment plan. Same wording as the app (apps/mobile/lib/taxPlanner/copy.ts).

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

function noPoaText(reason: TaxPlannerNoPoaReason, basedOn: string): string {
  switch (reason) {
    case "under_threshold":
      return `Nothing in advance: your ${basedOn} bill was under £1,000.`;
    case "mostly_deducted_at_source":
      return `Nothing in advance: more than 80% of your ${basedOn} tax was taken through PAYE.`;
    case "no_bill":
      return `Nothing in advance: there was no self-employed bill for ${basedOn}.`;
  }
}

export function partHint(part: TaxPlannerPart): string | null {
  if (part.kind === "balancing") {
    if (part.overpaidPence && part.overpaidPence > 0) {
      return "Your payments on account came to more than the bill, so there is nothing left to pay. HMRC pays the extra back or takes it off your next payment.";
    }
    return "The balancing payment: the bill less anything already paid on account.";
  }
  if (part.amountPence === 0 && part.noPoaReason) {
    return noPoaText(part.noPoaReason, previousTaxYear(part.taxYear));
  }
  return `An advance towards ${part.taxYear}, half of your ${previousTaxYear(part.taxYear)} bill.`;
}

export function sourceLabel(source: TaxPlannerBillSource, taxYear: string): string {
  switch (source) {
    case "entered":
      return "The figure you entered";
    case "estimate":
      return "From what you have recorded in MileClear";
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

export function nextPayment(payments: TaxPlannerPayment[]): TaxPlannerPayment | null {
  return payments.find((p) => p.amountPence == null || p.amountPence > 0) ?? null;
}
