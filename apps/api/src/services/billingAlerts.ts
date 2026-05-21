// Billing-event alerts to admin users.
//
// Anthony's "money route" priority (4 May 2026): every subscription
// lifecycle event that affects revenue gets a real-time push to the
// admin's phone AND an email so there's a record. Diagnostic alerts
// (permission missing / stuck recording / etc) stay quiet — those
// don't affect revenue and the admin Alerts feed already covers them.
//
// Tiers:
//   "celebrate" — new subscription confirmed (push + email, friendly)
//   "act_now"   — orphan, validate fail, payment fail (push + email, urgent)
//   "aware"     — refund granted, refund request filed (email only,
//                 no push — informational, doesn't need immediate action)

import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../lib/push.js";
import { logEvent } from "./appEvents.js";
import { postToChannel } from "./discord.js";

const transporter =
  process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_KEY
    ? nodemailer.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        auth: {
          user: process.env.BREVO_SMTP_USER,
          pass: process.env.BREVO_SMTP_KEY,
        },
      })
    : null;

const FROM = process.env.EMAIL_FROM || "MileClear <noreply@mileclear.com>";
// Override via env if the recipient changes (handover, second admin, etc).
const ADMIN_EMAIL = process.env.BILLING_ALERT_EMAIL || "anthonygair@icloud.com";

export type BillingAlertTier = "celebrate" | "act_now" | "aware";

export type BillingAlertKind =
  | "subscription.new"
  | "subscription.orphan"
  | "subscription.validate_failed"
  | "subscription.payment_failed"
  | "subscription.refund_requested"
  | "subscription.refund_granted"
  | "subscription.revoked";

export interface BillingAlertInput {
  kind: BillingAlertKind;
  tier: BillingAlertTier;
  title: string; // ≤ 60 chars, push-friendly
  body: string;  // ≤ 200 chars, push-friendly first sentence; longer fine for email
  userId?: string | null;
  userEmail?: string | null;
  originalTransactionId?: string | null;
  details?: Record<string, unknown>;
}

async function notifyAdminsByPush(input: BillingAlertInput): Promise<number> {
  if (input.tier === "aware") return 0; // email-only tier
  const admins = await prisma.user.findMany({
    where: { isAdmin: true, pushToken: { not: null } },
    select: { id: true },
  });
  let sent = 0;
  for (const admin of admins) {
    try {
      const ticket = await sendPushToUser(admin.id, input.title, input.body, {
        action: "open_admin_billing",
        kind: input.kind,
        originalTransactionId: input.originalTransactionId ?? null,
        userId: input.userId ?? null,
      });
      if (ticket) sent += 1;
    } catch {
      // Swallow per-admin failures so one bad token doesn't block others.
    }
  }
  return sent;
}

async function notifyAdminByEmail(input: BillingAlertInput): Promise<boolean> {
  if (!transporter) return false;
  const subject = `[MileClear ${input.tier === "act_now" ? "⚠️ ACTION" : input.tier === "celebrate" ? "✓" : "•"}] ${input.title}`;

  const detailLines = [
    input.userEmail ? ["User", input.userEmail] : null,
    input.userId ? ["User ID", input.userId] : null,
    input.originalTransactionId ? ["Transaction", input.originalTransactionId] : null,
    ["Kind", input.kind],
    ["Time", new Date().toISOString()],
  ].filter(Boolean) as Array<[string, string]>;

  const detailHtml = detailLines
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#94a3b8;">${escapeHtml(k)}</td><td style="padding:4px 0;font-family:monospace;color:#0f172a;">${escapeHtml(v)}</td></tr>`)
    .join("");

  const extraJson = input.details
    ? `<pre style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:12px;color:#0f172a;overflow:auto;">${escapeHtml(JSON.stringify(input.details, null, 2))}</pre>`
    : "";

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(input.tier === "act_now" ? "Action required" : input.tier === "celebrate" ? "Subscription confirmed" : "For your awareness")}</p>
    <h1 style="margin:0 0 12px;font-size:18px;line-height:1.4;">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 20px;line-height:1.5;color:#334155;">${escapeHtml(input.body)}</p>
    <table style="border-collapse:collapse;font-size:13px;margin-bottom:16px;">${detailHtml}</table>
    ${extraJson}
    <p style="margin:24px 0 0;font-size:12px;color:#64748b;">View in admin: <a href="https://mileclear.com/dashboard/admin">mileclear.com/dashboard/admin</a></p>
  </div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: FROM,
      to: ADMIN_EMAIL,
      subject,
      html,
      text: `${input.title}\n\n${input.body}\n\n${detailLines.map(([k, v]) => `${k}: ${v}`).join("\n")}${input.details ? `\n\n${JSON.stringify(input.details, null, 2)}` : ""}`,
    });
    return true;
  } catch (err) {
    console.error("[billing-alert] Email send failed:", err);
    return false;
  }
}

/**
 * Mirror a billing alert to the relevant Discord channel. Routing:
 *   celebrate → #bot-logs (eventually #wins once the audience is right)
 *   act_now   → #mod-chat (oncall — orphans, payment fails)
 *   aware     → #bot-logs (refund logs)
 * Defensive: no-op when DISCORD_WEBHOOK_* env vars aren't set.
 */
async function notifyAdminByDiscord(input: BillingAlertInput): Promise<boolean> {
  const channel = input.tier === "act_now" ? "modChat" : "botLogs";
  const color =
    input.tier === "act_now"
      ? 0xef4444
      : input.tier === "celebrate"
        ? 0x10b981
        : 0x38bdf8;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (input.userEmail) fields.push({ name: "User", value: input.userEmail, inline: true });
  if (input.userId) fields.push({ name: "ID", value: input.userId, inline: true });
  if (input.originalTransactionId)
    fields.push({
      name: "Transaction",
      value: `\`${input.originalTransactionId}\``,
      inline: false,
    });

  return postToChannel(channel, {
    embeds: [
      {
        title: input.title,
        description: input.body,
        color,
        fields: fields.length ? fields : undefined,
        footer: { text: input.kind },
        timestamp: new Date().toISOString(),
      },
    ],
    suppressMentions: true,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Fire-and-forget billing alert. Never throws — caller's flow is
 * never blocked by a notification failure. Logs the dispatch as a
 * billing.alert_dispatched app_event for audit.
 */
export function notifyBillingEvent(input: BillingAlertInput): void {
  void (async () => {
    const [pushSent, emailOk, discordOk] = await Promise.all([
      notifyAdminsByPush(input).catch(() => 0),
      notifyAdminByEmail(input).catch(() => false),
      notifyAdminByDiscord(input).catch(() => false),
    ]);
    logEvent("billing.alert_dispatched", input.userId ?? null, {
      kind: input.kind,
      tier: input.tier,
      title: input.title,
      pushSent,
      emailOk,
      discordOk,
      originalTransactionId: input.originalTransactionId ?? null,
    });
  })();
}
