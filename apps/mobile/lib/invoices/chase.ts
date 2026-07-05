// Late-payment chase email (Phase 1) — Laura Joyce request, 4 Jul 2026.
//
// Deliberately a DRAFT, not a send: we compose the email and hand it to
// the user's own mail app via mailto:. Nothing leaves the phone without
// the user seeing exactly what will be sent, replies land in their own
// inbox, and MileClear's deliverability reputation is never on the line
// for someone else's debt collection. (Server-sent "MileClear has
// detected…" chasers are the possible Phase 2.)
//
// The template itself lives in @mileclear/shared (buildInvoiceChaseEmail)
// so web + mobile can't drift on the legal wording.

import { Linking, Share } from "react-native";
import { buildInvoiceChaseEmail, buildInvoiceChaseMailto } from "@mileclear/shared";
import type { Invoice } from "../api/invoices";

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
  const mailto = buildInvoiceChaseMailto(invoice, senderName);

  try {
    const canOpen = await Linking.canOpenURL(mailto);
    if (canOpen) {
      await Linking.openURL(mailto);
      return;
    }
  } catch {
    // fall through to share sheet
  }
  const { subject, body } = buildInvoiceChaseEmail(invoice, senderName);
  await Share.share({ message: `${subject}\n\n${body}` });
}
