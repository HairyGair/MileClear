// Invoice domain service (Get Paid, Jul 2026).
//
// computeStatus + findPotentialEarningMatches moved here verbatim from
// routes/invoices/index.ts so the chase job (jobs/invoices.ts) and the
// bank reconciler (services/invoiceReconcile.ts) can share them without
// importing a route module. markInvoicePaid is the ONE paid-transition
// path — manual PATCH, inbox accept, and bank-match all funnel through
// it so chase suppression and the earning-dedup prompt stay consistent.

import { Prisma, type Invoice } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";

export const INVOICE_STATUSES = ["sent", "paid", "overdue", "written_off"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Duplicate-detection window for the "you might have already logged this
// as a manual earning" prompt that fires when an invoice flips to paid.
// 50p tolerance handles VAT / rounding fuzz on small invoices; 14 days
// either side of paidAt covers "I logged the earning when the work
// happened, but the invoice took two weeks to pay". Wider windows turned
// up too many false positives on Laura's data.
export const DUPLICATE_AMOUNT_TOLERANCE_PENCE = 50;
export const DUPLICATE_DAYS_WINDOW = 14;

export interface PotentialEarningMatch {
  id: string;
  platform: string;
  amountPence: number;
  periodStart: string;
  notes: string | null;
  daysFromAnchor: number;
}

/**
 * Compute the canonical status of an invoice from its date fields.
 * Server-of-truth — clients never set status directly, only paidAt /
 * dueAt. Keeps a tri-state UI (sent / overdue / paid) without the user
 * having to maintain it manually.
 */
export function computeStatus(args: {
  paidAt: Date | null;
  dueAt: Date;
  writtenOff?: boolean;
}): InvoiceStatus {
  if (args.writtenOff) return "written_off";
  if (args.paidAt) return "paid";
  if (args.dueAt < new Date()) return "overdue";
  return "sent";
}

/**
 * Find manual earnings that look like they might already represent the
 * money on this invoice — within ±50p and ±14 days of the invoice's
 * paid (or sent, if not yet paid) date. See routes/invoices for the
 * link-or-keep flow this feeds.
 */
export async function findPotentialEarningMatches(args: {
  userId: string;
  invoiceId: string;
  amountPence: number;
  anchorDate: Date;
}): Promise<PotentialEarningMatch[]> {
  const { userId, invoiceId, amountPence, anchorDate } = args;
  const windowMs = DUPLICATE_DAYS_WINDOW * 24 * 60 * 60 * 1000;
  const windowStart = new Date(anchorDate.getTime() - windowMs);
  const windowEnd = new Date(anchorDate.getTime() + windowMs);

  const candidates = await prisma.earning.findMany({
    where: {
      userId,
      periodStart: { gte: windowStart, lte: windowEnd },
      amountPence: {
        gte: amountPence - DUPLICATE_AMOUNT_TOLERANCE_PENCE,
        lte: amountPence + DUPLICATE_AMOUNT_TOLERANCE_PENCE,
      },
      replacedByInvoiceId: null,
    },
    select: {
      id: true,
      platform: true,
      amountPence: true,
      periodStart: true,
      notes: true,
    },
  });
  void invoiceId;

  return candidates
    .map((c) => ({
      id: c.id,
      platform: c.platform,
      amountPence: c.amountPence,
      periodStart: c.periodStart.toISOString().slice(0, 10),
      notes: c.notes,
      daysFromAnchor: Math.round(
        (c.periodStart.getTime() - anchorDate.getTime()) / 86_400_000
      ),
    }))
    .sort((a, b) => {
      const dateDelta = Math.abs(a.daysFromAnchor) - Math.abs(b.daysFromAnchor);
      if (dateDelta !== 0) return dateDelta;
      return (
        Math.abs(a.amountPence - amountPence) -
        Math.abs(b.amountPence - amountPence)
      );
    })
    .slice(0, 10);
}

/**
 * Allocate the next per-user invoice number inside the caller's
 * transaction. Prisma's atomic increment is concurrency-safe on MySQL;
 * @@unique([userId, invoiceNumber]) is the backstop (caller retries once
 * on P2002). Numbers are never reused after deletion — gaps are fine.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  const u = await tx.user.update({
    where: { id: userId },
    data: { invoiceCounter: { increment: 1 } },
    select: { invoiceCounter: true },
  });
  return u.invoiceCounter;
}

/**
 * Ensure an invoice has a number, allocating one lazily for legacy rows.
 * Used by PDF generation and send — every document that leaves the app
 * carries a payment reference the reconciler can match on.
 */
export async function ensureInvoiceNumber(invoice: {
  id: string;
  userId: string;
  invoiceNumber: number | null;
}): Promise<number> {
  if (invoice.invoiceNumber != null) return invoice.invoiceNumber;
  return prisma.$transaction(async (tx) => {
    const n = await allocateInvoiceNumber(tx, invoice.userId);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { invoiceNumber: n },
    });
    return n;
  });
}

/**
 * The single paid-transition path. Sets paidAt + recomputed status,
 * suppresses any pending auto-chase instantly, logs the analytics event,
 * and returns the earning-dedup candidates (surfaced to the user — never
 * auto-linked; tax dedup keeps its confirm step).
 */
export async function markInvoicePaid(args: {
  userId: string;
  invoiceId: string;
  paidAt: Date;
  source: "manual" | "bank_match";
}): Promise<{ invoice: Invoice; potentialEarningMatches: PotentialEarningMatch[] }> {
  const { userId, invoiceId, paidAt, source } = args;

  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
  });
  if (!existing) throw new Error("Invoice not found");

  const status = computeStatus({
    paidAt,
    dueAt: existing.dueAt,
    writtenOff: existing.status === "written_off",
  });

  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paidAt,
      status,
      // Chase suppression: a paid invoice never chases again.
      nextChaseAt: null,
      chaseWarnedAt: null,
    },
  });

  logEvent("invoice.marked_paid", userId, {
    invoiceId,
    amountPence: invoice.amountPence,
    source,
    daysToPay: Math.round(
      (paidAt.getTime() - invoice.sentAt.getTime()) / 86_400_000
    ),
  });

  const potentialEarningMatches = await findPotentialEarningMatches({
    userId,
    invoiceId,
    amountPence: invoice.amountPence,
    anchorDate: paidAt,
  });

  return { invoice, potentialEarningMatches };
}
