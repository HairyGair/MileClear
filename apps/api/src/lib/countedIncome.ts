// The one rule for "how much money has this driver made": earnings plus
// counted invoices, where an earning the driver has linked to a counted
// invoice is left out so the same money is never counted twice (Laura Joyce,
// 21 May 2026: seven daily earnings linked to one £400 invoice).
//
// Used by the Tax tab snapshot, the tax planner and the earnings badges, so
// the three can never disagree about what counts.
//
//  - Cash basis (the default, and always for badges): an invoice counts once
//    it is marked paid, unless it was written off.
//  - Accruals basis: an invoice counts from the day it was sent, unless it
//    was written off.
//  - An earning counts unless replacedByInvoiceId points at a counted invoice.
//    An earning linked to an invoice that is not counted yet (still unpaid on
//    cash basis) keeps counting, so the money shows exactly once either way.

import type { Prisma } from "@prisma/client";

export type IncomeBasis = "cash" | "accruals";

/** The invoices that count as income, optionally inside a date range. */
export function countedInvoiceWhere(
  userId: string,
  basis: IncomeBasis,
  range?: { start: Date; end: Date }
): Prisma.InvoiceWhereInput {
  const dates = range ? { gte: range.start, lte: range.end } : undefined;
  return {
    userId,
    status: { not: "written_off" },
    ...(basis === "cash"
      ? { paidAt: dates ?? { not: null } }
      : dates
        ? { sentAt: dates }
        : {}),
  };
}

export interface IncomeEarning {
  amountPence: number;
  replacedByInvoiceId: string | null;
}

export interface IncomeInvoice {
  id: string;
  amountPence: number;
}

export interface CountedIncome<E extends IncomeEarning> {
  /** Earnings that still count (not linked to a counted invoice). */
  countedEarnings: E[];
  /** How many earnings were left out because a counted invoice covers them. */
  dedupedEarningCount: number;
  earningsPence: number;
  invoicePence: number;
  /** earningsPence + invoicePence. */
  totalPence: number;
}

/** Pure: apply the rule to rows already loaded. */
export function countIncome<E extends IncomeEarning>(
  earnings: readonly E[],
  countedInvoices: readonly IncomeInvoice[]
): CountedIncome<E> {
  const invoiceIds = new Set(countedInvoices.map((inv) => inv.id));
  const countedEarnings = earnings.filter(
    (e) => !e.replacedByInvoiceId || !invoiceIds.has(e.replacedByInvoiceId)
  );
  const earningsPence = countedEarnings.reduce((sum, e) => sum + e.amountPence, 0);
  const invoicePence = countedInvoices.reduce((sum, inv) => sum + inv.amountPence, 0);
  return {
    countedEarnings,
    dedupedEarningCount: earnings.length - countedEarnings.length,
    earningsPence,
    invoicePence,
    totalPence: earningsPence + invoicePence,
  };
}
