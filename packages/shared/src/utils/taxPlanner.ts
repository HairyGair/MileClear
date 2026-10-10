// Small tax payment plan helpers shared by the API and the app, so the Tax tab,
// the payment plan screen and /tax/overview agree.

import type { TaxPlannerPayment } from "../types/index.js";

/** The first payment that has money in it (or whose amount is not known yet). */
export function nextPayment(payments: TaxPlannerPayment[]): TaxPlannerPayment | null {
  return payments.find((p) => p.amountPence == null || p.amountPence > 0) ?? null;
}

/** An annual accountant's fee spread over 52 weeks, in pence. 0 when no fee. */
export function accountantWeeklyFee(annualFeePence: number | null | undefined): number {
  return annualFeePence && annualFeePence > 0 ? Math.round(annualFeePence / 52) : 0;
}
