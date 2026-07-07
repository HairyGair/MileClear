// Bank-payment → invoice reconciliation (Get Paid Milestone F, Jul 2026).
//
// Runs against ONLY the bank transactions created by the current sync
// (never re-litigates old rows) and matches incoming CREDITs to the
// user's open invoices:
//
//   CONFIDENT — the payment reference carries the invoice number
//   (INV-0042 in any reasonable spelling) or the invoice's own reference
//   string. Auto-marks the invoice paid (the ONE paid path in
//   services/invoices.ts, so auto-chase suppression is inherited),
//   consumes the transaction, and pushes "You got paid".
//
//   SUGGEST — amount matches within ±50p and the date sits in the
//   invoice's plausible window. Too weak to act on alone (a £120
//   day-rate invoice looks like any £120 credit), so the transaction
//   stays in the inbox with suggestedKind "invoice_payment" and the
//   invoice id in suggestedCategory; the user confirms with one tap.
//   Accepting creates NO Earning — the paid invoice IS the income
//   record (Tax Readiness aggregates it; creating both would be the
//   exact double-count the link-earning flow exists to prevent).

import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import { sendPushToUser } from "../lib/push.js";
import { markInvoicePaid } from "./invoices.js";
import { formatInvoiceNumber, formatPence } from "@mileclear/shared";

const AMOUNT_TOLERANCE_PENCE = 50;
const DATE_WINDOW_AFTER_DUE_DAYS = 60;

/** Lowercase, collapse whitespace/punctuation — bank references arrive
 *  as "INV 0042", "inv-42", "Inv0042 Acme" and similar. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.,/]+/g, "");
}

/** True when the haystack contains this invoice number in any of the
 *  common spellings (inv0042, inv42, invoice42…). */
function referencesInvoiceNumber(haystack: string, n: number): boolean {
  return new RegExp(`inv(?:oice)?0*${n}(?!\\d)`).test(haystack);
}

export async function reconcileInvoicePayments(
  userId: string,
  bankTransactionIds: string[]
): Promise<{ autoMatched: number; suggested: number }> {
  const result = { autoMatched: 0, suggested: 0 };
  if (bankTransactionIds.length === 0) return result;

  const openInvoices = await prisma.invoice.findMany({
    where: {
      userId,
      paidAt: null,
      status: { in: ["sent", "overdue"] },
    },
    select: {
      id: true,
      company: true,
      invoiceNumber: true,
      reference: true,
      amountPence: true,
      sentAt: true,
      dueAt: true,
    },
  });
  if (openInvoices.length === 0) return result;

  const txns = await prisma.bankTransaction.findMany({
    where: {
      id: { in: bankTransactionIds },
      userId,
      status: "pending",
      amountPence: { gt: 0 }, // CREDITs only (signed pence)
    },
  });

  for (const txn of txns) {
    const haystack = normalise(`${txn.merchant} ${txn.descriptionRaw ?? ""}`);

    // ── CONFIDENT: reference hit
    const confident = openInvoices.find((inv) => {
      if (inv.invoiceNumber != null && referencesInvoiceNumber(haystack, inv.invoiceNumber)) {
        return true;
      }
      if (inv.reference) {
        const ref = normalise(inv.reference);
        // Short refs ("A1", "42") false-positive on anything; require
        // at least 4 alphanumeric characters to trust a substring hit.
        if (ref.length >= 4 && haystack.includes(ref)) return true;
      }
      return false;
    });

    if (confident) {
      const { potentialEarningMatches } = await markInvoicePaid({
        userId,
        invoiceId: confident.id,
        paidAt: txn.transactionDate,
        source: "bank_match",
      });
      await prisma.bankTransaction.update({
        where: { id: txn.id },
        data: {
          status: "consumed",
          suggestedKind: "invoice_payment",
          suggestedCategory: confident.id,
          suggestedConfidence: 95,
          resolvedInvoiceId: confident.id,
          reviewedAt: new Date(),
        },
      });
      // Remove from the open set so one payment can't settle two invoices.
      openInvoices.splice(openInvoices.indexOf(confident), 1);
      logEvent("invoice.bank_matched", userId, {
        invoiceId: confident.id,
        bankTransactionId: txn.id,
        confidence: "reference",
      });
      const ref =
        confident.invoiceNumber != null
          ? formatInvoiceNumber(confident.invoiceNumber)
          : "Your invoice";
      const dupHint =
        potentialEarningMatches.length > 0
          ? " Tap to check for duplicate earnings."
          : "";
      await sendPushToUser(
        userId,
        "You got paid 🎉",
        `${formatPence(txn.amountPence)} from ${confident.company} — ${ref} marked paid.${dupHint}`,
        { action: "open_app" }
      );
      result.autoMatched++;
      continue;
    }

    // ── SUGGEST: amount + date window
    const candidates = openInvoices.filter((inv) => {
      const amountOk =
        Math.abs(txn.amountPence - inv.amountPence) <= AMOUNT_TOLERANCE_PENCE;
      if (!amountOk) return false;
      const windowEnd = new Date(inv.dueAt);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + DATE_WINDOW_AFTER_DUE_DAYS);
      return txn.transactionDate >= inv.sentAt && txn.transactionDate <= windowEnd;
    });
    if (candidates.length > 0) {
      // Closest amount wins the suggestion slot; never auto-mark on
      // amount alone.
      const best = candidates.sort(
        (a, b) =>
          Math.abs(a.amountPence - txn.amountPence) -
          Math.abs(b.amountPence - txn.amountPence)
      )[0];
      await prisma.bankTransaction.update({
        where: { id: txn.id },
        data: {
          suggestedKind: "invoice_payment",
          suggestedCategory: best.id,
          suggestedConfidence: 60,
        },
      });
      logEvent("invoice.bank_match_suggested", userId, {
        invoiceId: best.id,
        bankTransactionId: txn.id,
      });
      result.suggested++;
    }
  }

  return result;
}
