// Late-payment chase email (Phase 1) — Laura Joyce request, 4 Jul 2026.
//
// Deliberately a DRAFT, not a send: we compose the email and hand it to
// the user's own mail app via mailto:. Nothing leaves the phone without
// the user seeing exactly what will be sent, replies land in their own
// inbox, and MileClear's deliverability reputation is never on the line
// for someone else's debt collection. (Server-sent "MileClear has
// detected…" chasers are the possible Phase 2.)
//
// Legal wording note: there is no flat "8% late charge". The accurate
// hook is the Late Payment of Commercial Debts (Interest) Act 1998 —
// statutory interest at 8% + Bank of England base rate plus fixed
// compensation, and it applies to business-to-business debts only. The
// template states it as "may apply" and the user can delete the line in
// their mail app if the client is a consumer.

import { Linking, Share } from "react-native";
import type { Invoice } from "../api/invoices";

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function daysOverdue(invoice: Invoice): number {
  return Math.max(0, Math.floor((Date.now() - new Date(invoice.dueAt).getTime()) / 86_400_000));
}

export function buildChaseEmail(
  invoice: Invoice,
  senderName: string | null
): { subject: string; body: string } {
  const amount = `£${(invoice.amountPence / 100).toFixed(2)}`;
  const ref = invoice.reference ? ` ${invoice.reference}` : "";
  const overdue = daysOverdue(invoice);
  const overdueText = overdue === 1 ? "1 day" : `${overdue} days`;

  const subject = `Payment reminder — invoice${ref} for ${amount}, now ${overdueText} overdue`;

  const body = [
    "Hi,",
    "",
    `A friendly reminder that invoice${ref} for ${amount}, sent on ${formatLongDate(invoice.sentAt)}, was due for payment on ${formatLongDate(invoice.dueAt)} and is now ${overdueText} overdue.`,
    "",
    "Could you arrange payment at your earliest convenience? Please note that overdue business invoices may attract statutory interest at 8% plus the Bank of England base rate, together with fixed compensation, under the Late Payment of Commercial Debts (Interest) Act 1998.",
    "",
    "If payment is already on its way, please disregard this message — and thank you.",
    "",
    "Many thanks,",
    senderName || "",
    "",
    "--",
    "Sent with MileClear — mileage, invoices & tax for the self-employed",
    "https://mileclear.com",
  ].join("\n");

  return { subject, body };
}

/**
 * Open the chase draft in the user's mail app. Falls back to the iOS
 * share sheet when no mail app is configured (the draft text is shared
 * so it can go out via WhatsApp/SMS instead — chasing by text is
 * common between sole traders).
 */
export async function openChaseDraft(
  invoice: Invoice,
  senderName: string | null
): Promise<void> {
  const { subject, body } = buildChaseEmail(invoice, senderName);
  const to = invoice.clientEmail ?? "";
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  try {
    const canOpen = await Linking.canOpenURL(mailto);
    if (canOpen) {
      await Linking.openURL(mailto);
      return;
    }
  } catch {
    // fall through to share sheet
  }
  await Share.share({ message: `${subject}\n\n${body}` });
}
