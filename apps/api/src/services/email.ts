// Email service using Brevo SMTP relay (free tier: 300/day, ~9,000/month)
// Falls back to console logging when SMTP creds are not set

import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma.js";
import { signUnsubscribeToken } from "../lib/unsubscribeToken.js";
import {
  getLatestRelease,
  blogUrlForRelease,
  type ReleaseNote,
} from "@mileclear/shared";

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
const FROM_PERSONAL = "Gair - MileClear <gair@mileclear.com>";
const API_BASE_URL = process.env.API_BASE_URL || "https://api.mileclear.com";
const WEB_BASE_URL = process.env.WEB_BASE_URL || "https://mileclear.com";
const UNSUBSCRIBE_MAILTO = "gair@mileclear.com";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Marketing email gating + unsubscribe helpers ────────────────────────

// Check the user's opt-out flag before any marketing send. Returns true if we
// should proceed. Fails open (true) if the lookup throws, so a transient DB
// blip never silently drops a send queue.
async function isMarketingAllowed(userId: string): Promise<boolean> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { marketingEmailsEnabled: true },
    });
    return u?.marketingEmailsEnabled !== false;
  } catch {
    return true;
  }
}

// Build the headers the mail clients use to render a native "Unsubscribe"
// button (Gmail, iOS Mail, Apple Mail, Outlook). RFC 8058 One-Click + RFC 2369
// mailto fallback. Returns a plain object for nodemailer's `headers` option.
function unsubscribeHeaders(userId: string): Record<string, string> {
  const token = signUnsubscribeToken(userId);
  return {
    "List-Unsubscribe": `<${API_BASE_URL}/unsubscribe?token=${token}>, <mailto:${UNSUBSCRIBE_MAILTO}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "Precedence": "bulk",
    "X-Auto-Response-Suppress": "All",
  };
}

// Replace the old "reply with unsubscribe" footer line. Brand-styled, dark,
// keeps the same visual weight as the previous text but the link is clickable
// and routes through the public web confirmation page.
function unsubscribeFooterHtml(userId: string): string {
  const token = signUnsubscribeToken(userId);
  const url = `${WEB_BASE_URL}/unsubscribe?token=${token}`;
  return `You're receiving this because you have a MileClear account.<br/><a href="${url}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a> &nbsp;&middot;&nbsp; <a href="${WEB_BASE_URL}/dashboard/settings" style="color: #6b7280; text-decoration: underline;">Email preferences</a>`;
}

export async function sendVerificationEmail(
  email: string,
  code: string
): Promise<void> {
  const subject = "Verify your MileClear account";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 8px;">Verify your email</h2>
      <p style="color: #555; font-size: 15px; line-height: 1.5;">Enter this code in the MileClear app to verify your account:</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1a1a;">${code}</span>
      </div>
      <p style="color: #888; font-size: 13px;">This code expires in 10 minutes. If you didn't create a MileClear account, you can ignore this email.</p>
    </div>
  `;

  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP not configured  - cannot send verification email in production");
    }
    console.log(`[EMAIL] Verification code for ${email} (dev only)`);
    return;
  }

  await transporter.sendMail({ from: FROM, to: email, subject, html });
}

export async function sendPasswordResetEmail(
  email: string,
  code: string
): Promise<void> {
  const subject = "Reset your MileClear password";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 8px;">Reset your password</h2>
      <p style="color: #555; font-size: 15px; line-height: 1.5;">Enter this code in the MileClear app to reset your password:</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1a1a;">${code}</span>
      </div>
      <p style="color: #888; font-size: 13px;">This code expires in 10 minutes. If you didn't request a password reset, you can ignore this email.</p>
    </div>
  `;

  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP not configured  - cannot send password reset email in production");
    }
    console.log(`[EMAIL] Password reset code for ${email} (dev only)`);
    return;
  }

  await transporter.sendMail({ from: FROM, to: email, subject, html });
}

export async function sendWelcomeEmail(
  email: string,
  displayName?: string | null
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const subject = "Welcome to MileClear";
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background-color: #030712; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712;">
        <tr><td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%;">

            <!-- Header with logo -->
            <tr><td align="center" style="padding: 24px 0 32px;">
              <img src="https://mileclear.com/branding/logo-120x120.png" alt="MileClear" width="56" height="56" style="display: block; border: 0; border-radius: 12px;" />
            </td></tr>

            <!-- Main card -->
            <tr><td style="background-color: #0a1120; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <!-- Amber top accent bar -->
                <tr><td style="height: 3px; background: linear-gradient(90deg, #f5a623, #e8950f); border-radius: 16px 16px 0 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>

                <!-- Content -->
                <tr><td style="padding: 36px 32px 32px;">

                  <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 700; color: #f0f2f5;">Welcome to <span style="color: #f5a623;">MileClear</span></h1>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">Thanks for signing up! MileClear is built for UK gig workers, delivery drivers, and anyone who drives for work. Here's everything that's included:</p>

                  <!-- Free features -->
                  <p style="color: #f5a623; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Free for everyone</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Automatic trip recording</strong> - just drive and MileClear detects your trips in the background. No buttons to press.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Tax Readiness card</strong> - live tax + NI estimate, weekly set-aside calculated from your real numbers, and a countdown to the 31 January deadline.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">HMRC tax deductions</strong> - 55p/mile (24p for mopeds, was 45p before 6 April 2026) calculated automatically per vehicle, with your running total on the dashboard.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Anonymous Benchmarking</strong> - see how your weekly miles, trips, and platform mix compare to other UK MileClear drivers. Privacy-floored at 5 contributors per cell.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">HMRC Reconciliation</strong> - see what HMRC has on file for each platform versus what MileClear tracked, fix gaps before they become a problem.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Activity Heatmap</strong> - 7 days &times; 24 hours of when you drive and earn most, filtered by platform.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">MOT &amp; tax expiry reminders</strong> - your vehicle's DVLA data refreshes weekly. Push notification 14 days before expiry. Plus the full DVSA MOT history including advisories on every test.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Smart classification</strong> - trips near your saved work locations are auto-tagged as business. Platform tags suggested from your history.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Shift management</strong> - start a shift, group your trips, see your scorecard with honest A-F grades based on real profit.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Earnings &amp; pickup-wait tracking</strong> - log per-platform earnings and tap-to-time waits at restaurants and depots.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Fuel prices</strong> - cheapest fuel near you from 8,300+ UK stations, with full fuel-log support.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Achievements &amp; recaps</strong> - badges, personal records, weekly and monthly summaries you can share.</td>
                      </tr></table>
                    </td></tr>
                  </table>

                  <!-- Pro features -->
                  <p style="color: #10b981; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Pro features &middot; &pound;4.99/mo</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #10b981; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Self Assessment wizard</strong> - step-by-step mapping of your numbers to actual HMRC SA103 form boxes, with full income tax + NI breakdown.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #10b981; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">HMRC-ready exports</strong> - CSV, PDF mileage log, and Self Assessment PDF with a signed attestation cover sheet HMRC inspectors recognise.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #10b981; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Accountant Portal</strong> - invite your accountant by email to a read-only dashboard with your trips, expenses, and earnings.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #10b981; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Receipt scanning</strong> - point your camera at a parking ticket, fuel receipt, or toll. On-device OCR, your images never leave your phone.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #10b981; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">CSV earnings import</strong> - bulk import from Uber, Deliveroo, Just Eat, Amazon Flex, Stuart.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #10b981; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Business analytics</strong> - earnings per mile, golden hours, platform comparison, weekly P&amp;L, shift grading.</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 8px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #10b981; font-size: 14px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Unlimited saved locations</strong> - save every depot, regular stop, and zone. Free tier capped at 2.</td>
                      </tr></table>
                    </td></tr>
                  </table>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 24px;"><strong style="color: #f0f2f5;">To get started:</strong> add a vehicle, set your home and work locations, then just drive. MileClear handles the rest.</p>

                  <!-- Support callout -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 28px;">
                    <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.15); border-radius: 10px; padding: 18px 20px;">
                      <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;"><strong style="color: #f5a623;">Need help?</strong> Head to <strong style="color: #f5a623;">Help &amp; Support</strong> in your profile, or just reply to this email. I read every message and I'll get back to you personally.</p>
                    </td></tr>
                  </table>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0;">Cheers,</p>
                  <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>

                </td></tr>
              </table>
            </td></tr>

            <!-- Footer -->
            <tr><td align="center" style="padding: 28px 0 8px;">
              <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">You're receiving this because you created a MileClear account.<br/>If that wasn't you, you can safely ignore this email.</p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  if (!transporter) {
    console.log(`[EMAIL] Welcome email for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM_PERSONAL, to: email, replyTo: "gair@mileclear.com", subject, html });
}

/**
 * Pro welcome email — founder-voice, personal, sent once when a user
 * first upgrades to Pro (Stripe checkout completes OR Apple IAP
 * validate flips isPremium to true). Idempotency is the caller's
 * responsibility: check for an `appEvent` of type `welcome.pro_sent`
 * for the user before calling this, and log it after.
 *
 * Transactional — does NOT honour the marketing opt-out. It's a
 * one-shot thank-you for paying customers, not a marketing nudge.
 */
export async function sendProWelcomeEmail(
  email: string,
  displayName?: string | null
): Promise<void> {
  const firstName = (displayName ?? "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
  const subject = "Thanks for trying MileClear Pro";
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background-color: #030712; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712;">
        <tr><td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%;">

            <!-- Header with logo -->
            <tr><td align="center" style="padding: 24px 0 32px;">
              <img src="https://mileclear.com/branding/logo-120x120.png" alt="MileClear" width="56" height="56" style="display: block; border: 0; border-radius: 12px;" />
            </td></tr>

            <!-- Main card -->
            <tr><td style="background-color: #0a1120; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="height: 3px; background: linear-gradient(90deg, #f5a623, #e8950f); border-radius: 16px 16px 0 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                <tr><td style="padding: 36px 32px 32px;">

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">Anthony here, the founder of MileClear. I wanted to drop you a personal note to say thanks for upgrading to Pro today.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">When you build something like this on your own, every paying customer matters more than I can comfortably explain. You're one of them now, so genuinely &mdash; thank you.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 12px;">A few useful things now that you're in:</p>

                  <ol style="color: #c0c8d4; font-size: 14px; line-height: 1.7; margin: 0 0 20px; padding-left: 20px;">
                    <li style="margin-bottom: 12px;"><strong style="color: #f0f2f5;">Everything you record is yours.</strong> If you ever cancel Pro, every mile you've tracked stays with you. No data lock-in, no ransom.</li>
                    <li style="margin-bottom: 12px;"><strong style="color: #f0f2f5;">HMRC quarterly submissions (MTD ITSA)</strong> live under Avatar &rarr; Work &amp; Tax &rarr; MTD ITSA. We're currently in HMRC's sandbox while their production accreditation lands &mdash; submissions go to a test environment, not your real tax account. The Sandbox banner makes that obvious so you don't accidentally rely on it for a real submission.</li>
                    <li style="margin-bottom: 12px;"><strong style="color: #f0f2f5;">The Tax Readiness card on your dashboard</strong> shows what to set aside each week. The more trips and earnings you log, the more accurate it gets.</li>
                    <li style="margin-bottom: 0;"><strong style="color: #f0f2f5;">There's a quick tour</strong> you can replay any time from Avatar &rarr; Help &amp; Tutorials. The same screen has a categorised FAQ for the trickier bits (cash vs accruals, PAYE offset, employer mileage rate).</li>
                  </ol>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">If anything looks wrong, doesn't make sense, or you have an idea for something the app should do &mdash; just reply to this email. I read every one and usually get back within a few hours.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">You can cancel anytime from iPhone Settings &rarr; your name &rarr; Subscriptions. Nothing locked away if you leave.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 4px;">Welcome aboard,</p>
                  <p style="color: #f0f2f5; font-size: 15px; line-height: 1.7; margin: 0; font-weight: 600;">Anthony</p>
                  <p style="color: #8494a7; font-size: 13px; line-height: 1.5; margin: 0;">Founder, MileClear</p>

                </td></tr>
              </table>
            </td></tr>

            <!-- Footer -->
            <tr><td style="padding: 24px 16px 0;">
              <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">You're receiving this because you upgraded to MileClear Pro. Reply to this email for support &mdash; it lands in my inbox directly.</p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  if (!transporter) {
    console.log(`[EMAIL] Pro welcome email for ${email}`);
    return;
  }

  await transporter.sendMail({
    from: FROM_PERSONAL,
    to: email,
    replyTo: "gair@mileclear.com",
    subject,
    html,
  });
}

// ── Shared branded email shell ────────────────────────────────────────
// One polished, consistent wrapper for the campaign emails (re-engagement,
// product update, service status). Dark navy (#030712) canvas, glass card,
// amber accent, "MileClear" wordmark header, bulletproof CTA button.
const APP_STORE_URL = "https://apps.apple.com/gb/app/mileclear/id6759671005";

/** Bulletproof amber CTA button (table-based, dark text for contrast). */
function ctaButton(label: string, url: string, accent = "#f5a623"): string {
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin: 10px auto 8px;">
          <tr><td align="center" style="border-radius: 14px; background-color: ${accent}; background: linear-gradient(135deg, #ffc04d, ${accent} 55%, #e8950f); box-shadow: 0 10px 28px rgba(245,166,35,0.38);">
            <a href="${url}" style="display: inline-block; padding: 16px 46px; font-size: 15px; font-weight: 800; color: #1a1205; text-decoration: none; border-radius: 14px; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; letter-spacing: 0.3px;">${label}&nbsp;&nbsp;&rarr;</a>
          </td></tr>
        </table>`;
}

/** Reply-to-me callout card (amber-tinted). */
function replyCard(message: string): string {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.18); border-radius: 12px; padding: 18px 20px;">
            <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;">${message}</p>
          </td></tr>
        </table>`;
}

function emailShell(opts: {
  preheader: string;
  eyebrow?: string;
  eyebrowColor?: string;
  title: string;
  accentColor?: string;
  bodyHtml: string;
  footerHtml: string;
}): string {
  const accent = opts.accentColor ?? "#f5a623";
  const eyebrowColor = opts.eyebrowColor ?? accent;
  const isGreen = opts.eyebrowColor === "#34d399";
  const pillBg = isGreen ? "rgba(16,185,129,0.16)" : "rgba(245,166,35,0.16)";
  const pillBorder = isGreen ? "rgba(16,185,129,0.42)" : "rgba(245,166,35,0.4)";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background-color:#030712;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;font-size:1px;line-height:1px;color:#030712;">${opts.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#030712;">
<tr><td align="center" style="padding:32px 16px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Wordmark header -->
  <tr><td align="center" style="padding:8px 0 26px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;padding-right:12px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:rgba(245,166,35,0.14);border:1px solid rgba(245,166,35,0.3);border-radius:13px;padding:7px;box-shadow:0 6px 18px rgba(245,166,35,0.22);">
          <img src="https://mileclear.com/branding/logo-120x120.png" alt="" width="36" height="36" style="display:block;border:0;border-radius:9px;" />
        </td></tr></table>
      </td>
      <td style="vertical-align:middle;">
        <span style="font-size:25px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">Mile<span style="color:${accent};">Clear</span></span>
      </td>
    </tr></table>
  </td></tr>

  <!-- Card -->
  <tr><td style="background-color:#0a1120;border-radius:20px;border:1px solid rgba(245,166,35,0.14);box-shadow:0 24px 60px rgba(0,0,0,0.5);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height:6px;background-color:${accent};background:linear-gradient(90deg,#ffc04d,${accent} 50%,#e8950f);border-radius:20px 20px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
      <!-- Hero zone with amber glow -->
      <tr><td style="padding:34px 36px 4px;background:linear-gradient(180deg,rgba(245,166,35,0.17) 0%,rgba(245,166,35,0.04) 45%,rgba(245,166,35,0) 80%);">
        ${opts.eyebrow ? `<p style="margin:0 0 16px;"><span style="display:inline-block;background-color:${pillBg};border:1px solid ${pillBorder};color:${eyebrowColor};font-size:11px;font-weight:800;letter-spacing:0.9px;text-transform:uppercase;padding:6px 14px;border-radius:999px;">${opts.eyebrow}</span></p>` : ""}
        <h1 style="margin:0 0 6px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.6px;line-height:1.22;">${opts.title}</h1>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:18px 36px 36px;">
${opts.bodyHtml}
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td align="center" style="padding:28px 12px 8px;">
    <p style="color:#6b7689;font-size:14px;line-height:1.6;margin:0 0 10px;font-weight:700;">Mile<span style="color:${accent};">Clear</span> &nbsp;&middot;&nbsp; UK mileage tracking, built for drivers</p>
    <p style="color:#42505f;font-size:12px;line-height:1.5;margin:0;">${opts.footerHtml}</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export async function sendReEngagementEmail(
  email: string,
  displayName: string | null | undefined,
  stats: { totalTrips: number; totalMiles: number } | null | undefined,
  userId: string
): Promise<void> {
  if (!(await isMarketingAllowed(userId))) return;
  const { subject, html } = renderReEngagement(displayName, stats, userId);
  await deliver({
    email,
    subject,
    html,
    userId,
    label: "Re-engagement",
    gated: false,
  });
}

function renderReEngagement(
  displayName: string | null | undefined,
  stats: { totalTrips: number; totalMiles: number } | null | undefined,
  userId: string
): { subject: string; html: string } {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";

  // Personalise based on whether they've used the app
  const hasUsed = stats && stats.totalTrips > 0;
  const tripCount = stats?.totalTrips ?? 0;
  const milesLabel = (stats?.totalMiles ?? 0).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  const eyebrow = hasUsed ? "Your progress so far" : "Ready when you are";
  const title = hasUsed
    ? "Your miles are adding up"
    : `Let's track your first trip`;
  const subject = hasUsed
    ? "Your miles are adding up - here's what's new in MileClear"
    : "You're all set up - ready to track your first trip?";

  // Hero block: a stat card for active users, a quick-start card for new ones
  const heroBlock = hasUsed
    ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 26px;">
          <tr><td style="background-color: #0d1424; background: linear-gradient(135deg, rgba(245,166,35,0.16) 0%, rgba(245,166,35,0.03) 60%, rgba(245,166,35,0.07) 100%); border: 1px solid rgba(245,166,35,0.34); border-radius: 16px; padding: 26px 20px; box-shadow: 0 8px 26px rgba(245,166,35,0.12);">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="50%" align="center" style="border-right: 1px solid rgba(245,166,35,0.14);">
                <p style="margin: 0; font-size: 38px; font-weight: 800; color: #f5a623; letter-spacing: -1.2px; line-height: 1;">${tripCount.toLocaleString("en-GB")}</p>
                <p style="margin: 8px 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #b89a6a;">Trip${tripCount !== 1 ? "s" : ""} tracked</p>
              </td>
              <td width="50%" align="center">
                <p style="margin: 0; font-size: 38px; font-weight: 800; color: #f5a623; letter-spacing: -1.2px; line-height: 1;">${milesLabel}</p>
                <p style="margin: 8px 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #b89a6a;">Miles logged</p>
              </td>
            </tr></table>
          </td></tr>
        </table>`
    : `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 26px;">
          <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.18); border-radius: 12px; padding: 18px 20px;">
            <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;"><strong style="color: #f5a623;">One-time setup:</strong> set background location to "Always" in your phone settings, then open MileClear once. After that it detects and logs your drives automatically - you don't have to press a thing.</p>
          </td></tr>
        </table>`;

  const introLine = hasUsed
    ? `You've already tracked <strong style="color: #f5a623;">${tripCount.toLocaleString("en-GB")} trip${tripCount !== 1 ? "s" : ""}</strong> and <strong style="color: #f5a623;">${milesLabel} miles</strong> - nice work. Here's what's waiting for you in the app, all free:`
    : "You're all set up, but you haven't recorded your first trip yet. Here's what MileClear does for you the moment you do - all free:";

  const featureRows = [
    [
      "Tax Readiness card",
      "a live tax + NI estimate on your dashboard, with a weekly set-aside figure and a 31 January countdown.",
    ],
    [
      "Automatic trip tracking",
      "drives detected and logged in the background at the new 55p/mile HMRC rate - no buttons, no forgetting.",
    ],
    [
      "MOT &amp; tax expiry reminders",
      "a heads-up 14 days before your vehicle's MOT or road tax runs out. No more surprise off-road days.",
    ],
    [
      "Fuel price finder",
      "compare pump prices across 8,300+ UK stations so you fill up at the cheapest one near you.",
    ],
  ]
    .map(
      ([t, b], i, arr) => `
            <tr><td style="padding: 11px 0;${i < arr.length - 1 ? " border-bottom: 1px solid rgba(255,255,255,0.05);" : ""}">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="width: 30px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 15px;">&#9672;</td>
                <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">${t}</strong> - ${b}</td>
              </tr></table>
            </td></tr>`
    )
    .join("");

  const bodyHtml = `
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>
${heroBlock}
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 8px;">${introLine}</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 4px 0 28px;">${featureRows}
        </table>

${ctaButton("Open MileClear", APP_STORE_URL)}

        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 22px 0 8px;">Got a question or something not working? Just reply to this email - I read every message.</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 16px 0 0;">Cheers,</p>
        <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>`;

  const html = emailShell({
    preheader: hasUsed
      ? `${tripCount} trips and ${milesLabel} miles logged - here's what else is waiting in MileClear.`
      : "You're set up - here's everything MileClear does the moment you record your first trip.",
    eyebrow,
    title,
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });

  return { subject, html };
}

export function renderReEngagementPreview(): { subject: string; html: string } {
  return renderReEngagement(
    "Anthony",
    { totalTrips: 47, totalMiles: 612.4 },
    "preview"
  );
}

/**
 * One-of-our-bullets renderer. Highlights are formatted as
 *   "**Title** - body text"
 * The "**Title** -" prefix is rendered bold + the rest in body weight.
 * Highlights without a "**...**" prefix render as a plain bullet line.
 */
function renderHighlightBullet(highlight: string): string {
  const escaped = escapeHtml(highlight);
  // Convert **Title** at the start (followed by " - " or " — ") to <strong>Title</strong>.
  const m = /^\*\*([^*]+)\*\*\s*[-–—]\s*(.*)$/.exec(highlight);
  if (m) {
    return `<strong style="color: #f0f2f5;">${escapeHtml(m[1])}</strong> - ${escapeHtml(m[2])}`;
  }
  return escaped;
}

/**
 * Render the email body for a release. Used by both sendUpdateEmail
 * (real send) and renderUpdateEmailPreview (admin dry-run preview).
 */
function renderUpdateEmailHtml(args: {
  release: ReleaseNote;
  greeting: string;
  unsubscribeFooter: string;
}): string {
  const { release, greeting, unsubscribeFooter } = args;
  const hero = release.emailHero ?? `What's new in ${release.version}`;
  const tagline =
    release.emailTagline ??
    `MileClear ${release.version} is now live on the App Store.`;
  const highlights =
    release.emailHighlights && release.emailHighlights.length > 0
      ? release.emailHighlights
      : release.items.slice(0, 5);
  const blogUrl = blogUrlForRelease(release.version);

  const bulletRows = highlights
    .map(
      (h) => `
          <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width: 28px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 14px;">&#9672;</td>
              <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;">${renderHighlightBullet(h)}</td>
            </tr></table>
          </td></tr>`
    )
    .join("");

  const bodyHtml = `
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">${escapeHtml(tagline)}</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 26px;">${bulletRows}
        </table>

${ctaButton("See what's new", blogUrl)}

        <p style="color: #8a94a6; font-size: 13px; line-height: 1.6; margin: 22px 0 24px; text-align: center;">Or read the full release notes: <a href="${blogUrl}" style="color: #f5a623; text-decoration: none; font-weight: 600;">What's new in ${escapeHtml(release.version)}</a></p>

${replyCard("Something not working? Got ideas? Reply to this email - I read every message and I'll get back to you personally. Several of the features above came directly from messages exactly like that.")}

        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0;">Cheers,</p>
        <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>`;

  return emailShell({
    preheader: tagline,
    eyebrow: `Version ${escapeHtml(release.version)} &middot; What's new`,
    title: escapeHtml(hero),
    bodyHtml,
    footerHtml: unsubscribeFooter,
  });
}

/**
 * Preview the Product Update email for the current Latest release
 * without sending. Used by the admin Dry Run flow so the operator
 * can verify subject + body match expectations before tapping Send.
 */
export function renderUpdateEmailPreview(): { subject: string; html: string } | null {
  const release = getLatestRelease();
  if (!release) return null;
  const subject =
    release.emailSubject ?? `MileClear ${release.version} - what's new`;
  const html = renderUpdateEmailHtml({
    release,
    greeting: "Hi {firstName},",
    unsubscribeFooter: "&lt;unsubscribe footer rendered per recipient&gt;",
  });
  return { subject, html };
}

export async function sendUpdateEmail(
  email: string,
  displayName: string | null | undefined,
  userId: string
): Promise<void> {
  if (!(await isMarketingAllowed(userId))) return;

  const release = getLatestRelease();
  if (!release) {
    throw new Error(
      "No release marked 'Latest' in RELEASE_NOTES — refusing to send update email."
    );
  }

  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const subject =
    release.emailSubject ?? `MileClear ${release.version} - what's new`;
  const html = renderUpdateEmailHtml({
    release,
    greeting,
    unsubscribeFooter: unsubscribeFooterHtml(userId),
  });


  if (!transporter) {
    console.log(`[EMAIL] Update email for ${email}`);
    return;
  }

  await transporter.sendMail({
    from: FROM_PERSONAL,
    to: email,
    replyTo: "gair@mileclear.com",
    subject,
    html,
    headers: unsubscribeHeaders(userId),
  });
}

export async function sendServiceStatusEmail(
  email: string,
  displayName: string | null | undefined,
  userId: string
): Promise<void> {
  if (!(await isMarketingAllowed(userId))) return;
  const { subject, html } = renderServiceStatus(displayName, userId);
  await deliver({
    email,
    subject,
    html,
    userId,
    label: "Service status",
    gated: false,
  });
}

function renderServiceStatus(
  displayName: string | null | undefined,
  userId: string
): { subject: string; html: string } {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const subject = "MileClear is back up and running";
  const bodyHtml = `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr><td style="background-color: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.32); border-radius: 999px; padding: 9px 18px;">
            <span style="color: #34d399; font-size: 13px; font-weight: 700; letter-spacing: 0.2px;">&#9679;&nbsp; All systems operational</span>
          </td></tr>
        </table>

        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>

        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">Just a quick heads-up - you may have run into trouble signing in or syncing earlier today. Our server had a brief hiccup, but everything is now back up and running as normal.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
          <tr><td style="background-color: #070d18; border: 1px solid rgba(16,185,129,0.2); border-radius: 12px; padding: 18px 20px;">
            <p style="color: #d4f3e6; font-size: 14px; line-height: 1.65; margin: 0;"><strong style="color: #34d399;">No data was lost.</strong> Every trip, earning, and record is safe. If you were mid-trip when it happened, anything recorded on your phone will sync automatically the next time you open the app.</p>
          </td></tr>
        </table>

        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 22px;">Just open the app and you're good to go.</p>

${ctaButton("Open MileClear", APP_STORE_URL)}

        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 22px 0 8px;">Sorry for the inconvenience, and thanks for your patience. If anything still seems off, just reply to this email.</p>

        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 16px 0 0;">Cheers,</p>
        <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>`;

  const html = emailShell({
    preheader: "The earlier sign-in and sync issue is fixed. No data was lost - everything is back to normal.",
    eyebrow: "Service update",
    eyebrowColor: "#34d399",
    title: `We're back up and running`,
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });

  return { subject, html };
}

export function renderServiceStatusPreview(): { subject: string; html: string } {
  return renderServiceStatus("Anthony", "preview");
}

// ── Lifecycle, Tax, Billing & Account Emails ──────────────────────────
// Built on emailShell(). Marketing emails pass gated:true (respect
// marketingEmailsEnabled + carry a List-Unsubscribe footer). Transactional
// account/security emails pass gated:false and use a plain footer.

const DASHBOARD_URL = "https://mileclear.com/dashboard";
const SUPPORT_URL = "https://mileclear.com/support";
const LOGIN_URL = "https://mileclear.com/login";

/** "£X.XX" from integer pence. */
function gbp(pence: number): string {
  return (
    "£" +
    (pence / 100).toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const SIGN_OFF = `        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 22px 0 8px;">Cheers,</p>
        <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>`;

function para(text: string, mb = 16): string {
  return `        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 ${mb}px;">${text}</p>`;
}

/** Minimal footer for transactional/account emails (no marketing unsubscribe). */
function plainFooterHtml(): string {
  return `&copy; MileClear &middot; <a href="${SUPPORT_URL}" style="color:#5a6678;text-decoration:underline;">Support</a> &middot; Automated account notification.`;
}

/** Equal-column stat card (2 or 3 cells). */
function statGrid(
  cells: { value: string; label: string }[],
  accent = "#f5a623"
): string {
  const w = Math.floor(100 / Math.max(cells.length, 1));
  const tds = cells
    .map(
      (c, i) => `
              <td width="${w}%" align="center"${i < cells.length - 1 ? ' style="border-right: 1px solid rgba(255,255,255,0.06);"' : ""}>
                <p style="margin: 0; font-size: 30px; font-weight: 800; color: ${accent}; letter-spacing: -1px; line-height: 1;">${c.value}</p>
                <p style="margin: 8px 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #8a94a6;">${c.label}</p>
              </td>`
    )
    .join("");
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 26px;">
          <tr><td style="background-color: #0d1424; background: linear-gradient(135deg, rgba(245,166,35,0.14) 0%, rgba(245,166,35,0.03) 60%, rgba(245,166,35,0.06) 100%); border: 1px solid rgba(245,166,35,0.32); border-radius: 16px; padding: 26px 14px; box-shadow: 0 8px 26px rgba(245,166,35,0.1);">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tds}
            </tr></table>
          </td></tr>
        </table>`;
}

/** Numbered steps card. */
function stepsCard(steps: string[], accent = "#f5a623"): string {
  const rows = steps
    .map(
      (s, i) => `
              <tr><td style="padding: 7px 0; vertical-align: top;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td style="width: 28px; vertical-align: top;"><span style="display:inline-block;width:20px;height:20px;background-color:${accent};color:#0a0e1a;border-radius:50%;font-size:12px;font-weight:800;text-align:center;line-height:20px;">${i + 1}</span></td>
                  <td style="color:#c0c8d4;font-size:14px;line-height:1.6;padding-left:8px;">${s}</td>
                </tr></table>
              </td></tr>`
    )
    .join("");
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 4px 0 22px;">
          <tr><td style="background-color:#070d18;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
            </table>
          </td></tr>
        </table>`;
}

/** Label : value detail card (for security / billing details). */
function detailCard(rows: [string, string][]): string {
  const trs = rows
    .map(
      ([k, v], i) => `
              <tr><td style="padding:11px 0;${i > 0 ? "border-top:1px solid rgba(255,255,255,0.06);" : ""}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td align="left" style="color:#7a8699;font-size:13px;">${k}</td>
                  <td align="right" style="color:#f0f2f5;font-size:14px;font-weight:600;">${v}</td>
                </tr></table>
              </td></tr>`
    )
    .join("");
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 4px 0 22px;">
          <tr><td style="background-color:#070d18;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:4px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${trs}
            </table>
          </td></tr>
        </table>`;
}

function warningCard(message: string): string {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 22px;">
          <tr><td style="background-color: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.25); border-radius: 12px; padding: 16px 18px;">
            <p style="color: #fca5a5; font-size: 14px; line-height: 1.6; margin: 0;">${message}</p>
          </td></tr>
        </table>`;
}

function successCard(message: string): string {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 22px;">
          <tr><td style="background-color: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.28); border-radius: 12px; padding: 16px 18px;">
            <p style="color: #d4f3e6; font-size: 14px; line-height: 1.6; margin: 0;">${message}</p>
          </td></tr>
        </table>`;
}

function bulletList(items: string[], accent = "#f5a623"): string {
  const rows = items
    .map(
      (it, i, a) => `
            <tr><td style="padding: 9px 0;${i < a.length - 1 ? " border-bottom: 1px solid rgba(255,255,255,0.05);" : ""}">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="width: 28px; vertical-align: top; padding-top: 1px; color: ${accent}; font-size: 15px;">&#9672;</td>
                <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;">${it}</td>
              </tr></table>
            </td></tr>`
    )
    .join("");
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 4px 0 24px;">${rows}
        </table>`;
}

/** Shared delivery: gate marketing, log when no transporter. */
async function deliver(opts: {
  email: string;
  subject: string;
  html: string;
  userId: string;
  label: string;
  gated: boolean;
}): Promise<void> {
  if (opts.gated && !(await isMarketingAllowed(opts.userId))) return;
  if (!transporter) {
    console.log(`[EMAIL] ${opts.label} for ${opts.email}`);
    return;
  }
  await transporter.sendMail({
    from: FROM_PERSONAL,
    to: opts.email,
    replyTo: "gair@mileclear.com",
    subject: opts.subject,
    html: opts.html,
    headers: opts.gated ? unsubscribeHeaders(opts.userId) : undefined,
  });
}

// ── Custom email composer (admin) ─────────────────────────────────────
// Lets an admin write an email in a tiny, safe markdown subset and have it
// rendered through the same branded shell as every other email.
// Supported syntax (all input is HTML-escaped first):
//   - blank line               → new paragraph
//   - lines starting "- "      → bullet list
//   - lines starting "> "      → amber callout card
//   - **bold**                 → bold
//   - [label](https://url)     → amber link

function inlineMd(escaped: string): string {
  let s = escaped.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong style="color:#f0f2f5;">$1</strong>'
  );
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" style="color:#f5a623;text-decoration:none;font-weight:600;">$1</a>'
  );
  return s;
}

export function renderBodyMarkdown(text: string): string {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
        const items = lines.map((l) =>
          inlineMd(escapeHtml(l.trim().replace(/^[-*]\s+/, "")))
        );
        return bulletList(items);
      }
      if (lines.every((l) => l.trim().startsWith(">"))) {
        const msg = inlineMd(
          escapeHtml(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))
        );
        return replyCard(msg);
      }
      const html = lines.map((l) => inlineMd(escapeHtml(l))).join("<br>");
      return para(html);
    })
    .join("\n");
}

export interface CustomEmailArgs {
  subject: string;
  eyebrow?: string;
  title: string;
  bodyMarkdown: string;
  ctaLabel?: string;
  ctaUrl?: string;
  preheader?: string;
  includeGreeting: boolean;
  includeSignoff: boolean;
}

/** Render a custom email to branded HTML (used by preview + send). */
export function renderCustomEmailHtml(
  args: CustomEmailArgs,
  recipientName: string | null | undefined,
  userId: string
): string {
  const greeting = args.includeGreeting
    ? para(recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hi there,")
    : "";
  const cta =
    args.ctaLabel && args.ctaUrl
      ? ctaButton(escapeHtml(args.ctaLabel), args.ctaUrl)
      : "";
  const signoff = args.includeSignoff ? SIGN_OFF : "";
  const bodyHtml = [greeting, renderBodyMarkdown(args.bodyMarkdown), cta, signoff]
    .filter(Boolean)
    .join("\n");
  return emailShell({
    preheader: args.preheader?.trim() || args.title,
    eyebrow: args.eyebrow?.trim() ? escapeHtml(args.eyebrow.trim()) : undefined,
    title: escapeHtml(args.title),
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
}

/** Send a custom (admin-composed) email to one recipient. */
export async function sendCustomEmail(
  email: string,
  displayName: string | null | undefined,
  args: CustomEmailArgs,
  userId: string,
  gated: boolean
): Promise<void> {
  const html = renderCustomEmailHtml(
    args,
    args.includeGreeting ? displayName ?? null : null,
    userId
  );
  await deliver({
    email,
    subject: args.subject,
    html,
    userId,
    label: "Custom email",
    gated,
  });
}

// ── Activation + Retention ────────────────────────────────────────────

/** Location permission not set to "Always" — trips with the app closed aren't logged. */
export async function sendLocationPermissionEmail(
  email: string,
  displayName: string | null | undefined,
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para('MileClear is set up, but it can only log your drives automatically when location access is set to <strong style="color:#f0f2f5;">Always</strong>. It looks like yours is on "While Using" right now, which means trips you take with the app closed aren\'t being recorded.')}
${para("Here's the one-time fix:")}
${stepsCard([
    'Open <strong style="color:#f0f2f5;">Settings</strong> on your phone',
    "Tap <strong>MileClear</strong>, then <strong>Location</strong>",
    'Choose <strong style="color:#f5a623;">Always</strong>',
    "Switch on <strong>Precise Location</strong>",
  ])}
${para("That's it. From then on, MileClear detects and logs every drive in the background. You'll never have to press start.")}
${ctaButton("Open the setup guide", SUPPORT_URL)}
${para("Stuck on any step? Just reply and I'll walk you through it.", 8)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader:
      "Trips taken with the app closed aren't being recorded - here's the one setting that fixes it.",
    eyebrow: "Action needed",
    title: "MileClear can't see all your trips yet",
    bodyHtml,
    footerHtml: plainFooterHtml(),
  });
  await deliver({
    email,
    subject: "One setting to fix your trip tracking",
    html,
    userId,
    label: "Location permission",
    gated: false,
  });
}

/** Celebration the moment a user's first trip is captured. */
export async function sendFirstTripEmail(
  email: string,
  displayName: string | null | undefined,
  trip: { distanceMiles: number; deductionPence: number },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const miles = trip.distanceMiles.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  const bodyHtml = `
${para(greeting)}
${statGrid([
    { value: miles, label: "Miles tracked" },
    { value: gbp(trip.deductionPence), label: "Toward your deduction" },
  ])}
${para("That drive is saved, mapped, and counted - and you didn't have to lift a finger. That's exactly how every trip works from here.")}
${para("Two quick wins to get the most out of MileClear:")}
${bulletList([
    "<strong style=\"color:#f0f2f5;\">Classify it</strong> - mark trips as business or personal so the right ones count towards your tax.",
    '<strong style="color:#f0f2f5;">Set Home &amp; Work</strong> - saved locations make auto-detection even sharper.',
  ])}
${ctaButton("See your trip", DASHBOARD_URL)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `Your first trip is in: ${miles} miles tracked automatically.`,
    eyebrow: "Nice one",
    title: "You just logged your first trip",
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
  await deliver({
    email,
    subject: "Your first trip is in the books",
    html,
    userId,
    label: "First trip",
    gated: true,
  });
}

/** Weekly recap of trips / miles / deduction. */
export async function sendWeeklyRecapEmail(
  email: string,
  displayName: string | null | undefined,
  data: {
    weekLabel: string;
    trips: number;
    miles: number;
    deductionPence: number;
  },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const miles = data.miles.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  const bodyHtml = `
${para(greeting)}
${para("Here's how last week shaped up - all tracked automatically:")}
${statGrid([
    { value: data.trips.toLocaleString("en-GB"), label: "Trips" },
    { value: miles, label: "Miles" },
    { value: gbp(data.deductionPence), label: "Deduction" },
  ])}
${para(`That's <strong style="color:#f5a623;">${gbp(data.deductionPence)}</strong> closer to a sorted tax return, without a single button press. Open the app for your full breakdown, achievements, and where you drove.`)}
${ctaButton("Open your dashboard", DASHBOARD_URL)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `${data.trips} trips, ${miles} miles, ${gbp(data.deductionPence)} deduction last week.`,
    eyebrow: `Your week &middot; ${escapeHtml(data.weekLabel)}`,
    title: "Your week in miles",
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
  await deliver({
    email,
    subject: `Your week: ${data.trips} trips, ${miles} miles`,
    html,
    userId,
    label: "Weekly recap",
    gated: true,
  });
}

// ── Tax / HMRC seasonal ───────────────────────────────────────────────

/** Tax year-end summary (~5 April). */
export async function sendTaxYearEndSummaryEmail(
  email: string,
  displayName: string | null | undefined,
  data: {
    taxYear: string;
    businessMiles: number;
    trips: number;
    deductionPence: number;
  },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const miles = data.businessMiles.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const bodyHtml = `
${para(greeting)}
${para(`The <strong style="color:#f0f2f5;">${escapeHtml(data.taxYear)}</strong> tax year has closed. Here's everything you tracked - this is the figure you can claim against your Self Assessment:`)}
${statGrid([
    { value: miles, label: "Business miles" },
    { value: data.trips.toLocaleString("en-GB"), label: "Trips" },
    { value: gbp(data.deductionPence), label: "Deduction" },
  ])}
${para("When you're ready to file, your full HMRC self-assessment breakdown - box by box - is one tap away. No spreadsheets, no guesswork.")}
${ctaButton("View your tax summary", "https://mileclear.com/dashboard/tax")}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `${miles} business miles, ${gbp(data.deductionPence)} deduction for ${data.taxYear}.`,
    eyebrow: `${escapeHtml(data.taxYear)} &middot; Year-end summary`,
    title: `Your ${escapeHtml(data.taxYear)} mileage is ready`,
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
  await deliver({
    email,
    subject: `Your ${data.taxYear} mileage summary is ready`,
    html,
    userId,
    label: "Tax year-end summary",
    gated: true,
  });
}

/** Self Assessment deadline reminder (register / file / payment on account). */
export async function sendSelfAssessmentDeadlineEmail(
  email: string,
  displayName: string | null | undefined,
  data: {
    deadlineLabel: string; // e.g. "The Self Assessment filing deadline"
    dateLabel: string; // e.g. "31 January 2027"
    daysLeft: number;
    actionLine: string; // e.g. "file your 2025-26 return and pay any tax due"
    deductionPence?: number;
  },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${warningCard(`<strong style="color:#fca5a5;">${escapeHtml(data.dateLabel)}</strong> is the deadline to ${escapeHtml(data.actionLine)} - that's ${data.daysLeft} day${data.daysLeft !== 1 ? "s" : ""} away.`)}
${data.deductionPence ? para(`Good news: your mileage has already added up to <strong style="color:#f5a623;">${gbp(data.deductionPence)}</strong> in deductions this year. That's money off your bill, ready to claim.`) : ""}
${para("Your numbers are ready in MileClear. Export your HMRC self-assessment breakdown and the mileage section of your return is done.")}
${ctaButton("Get your numbers ready", "https://mileclear.com/dashboard/exports")}
${para("Questions about what counts? Just reply - happy to help.", 8)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `${data.dateLabel} deadline - your mileage figures are ready to file.`,
    eyebrow: "Self Assessment",
    title: `${escapeHtml(data.deadlineLabel)} is ${data.daysLeft} day${data.daysLeft !== 1 ? "s" : ""} away`,
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
  await deliver({
    email,
    subject: `${data.daysLeft} days to the Self Assessment deadline`,
    html,
    userId,
    label: "Self Assessment deadline",
    gated: true,
  });
}

/** Nudge to classify unclassified trips so they count toward the deduction. */
export async function sendUnclassifiedTripsNudgeEmail(
  email: string,
  displayName: string | null | undefined,
  data: { count: number; potentialDeductionPence: number },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${statGrid([
    { value: data.count.toLocaleString("en-GB"), label: "Unclassified trips" },
    {
      value: gbp(data.potentialDeductionPence),
      label: "Potential deduction",
    },
  ])}
${para(`Trips only count towards your tax deduction once they're marked as business. You've got <strong style="color:#f0f2f5;">${data.count}</strong> waiting - that's up to <strong style="color:#f5a623;">${gbp(data.potentialDeductionPence)}</strong> you could be claiming.`)}
${para("It takes about ten seconds to sort them. Tap each trip, pick business or personal, done.")}
${ctaButton("Classify my trips", DASHBOARD_URL)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `${data.count} trips to classify - up to ${gbp(data.potentialDeductionPence)} in deductions waiting.`,
    eyebrow: "Don't leave money behind",
    title: `You've got ${data.count} trip${data.count !== 1 ? "s" : ""} to classify`,
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
  await deliver({
    email,
    subject: `${data.count} trips waiting - up to ${gbp(data.potentialDeductionPence)} to claim`,
    html,
    userId,
    label: "Unclassified trips nudge",
    gated: true,
  });
}

// ── Billing / revenue ─────────────────────────────────────────────────

/** Payment failed (dunning). */
export async function sendPaymentFailedEmail(
  email: string,
  displayName: string | null | undefined,
  data: { amountPence: number; manageUrl: string },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para(`We tried to charge <strong style="color:#f0f2f5;">${gbp(data.amountPence)}</strong> for your MileClear Pro subscription, but the payment didn't go through - usually an expired or blocked card.`)}
${warningCard("Your Pro features are still active for now. We'll retry automatically, but updating your card makes sure nothing lapses.")}
${ctaButton("Update payment method", data.manageUrl)}
${para("Already sorted it? You can safely ignore this email.", 8)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: "We couldn't take your Pro payment - update your card to keep things running.",
    eyebrow: "Payment issue",
    eyebrowColor: "#f87171",
    title: "We couldn't take your payment",
    bodyHtml,
    footerHtml: plainFooterHtml(),
  });
  await deliver({
    email,
    subject: "Action needed: your MileClear payment didn't go through",
    html,
    userId,
    label: "Payment failed",
    gated: false,
  });
}

/** Upcoming renewal reminder (esp. annual). */
export async function sendRenewalReminderEmail(
  email: string,
  displayName: string | null | undefined,
  data: {
    planLabel: string;
    amountPence: number;
    dateLabel: string;
    manageUrl: string;
  },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para("Just a friendly heads-up - no action needed. Your MileClear Pro subscription renews automatically soon:")}
${detailCard([
    ["Plan", escapeHtml(data.planLabel)],
    ["Amount", gbp(data.amountPence)],
    ["Renews on", escapeHtml(data.dateLabel)],
  ])}
${para("Want to make changes, switch plan, or cancel? You can manage everything from your account in a couple of taps.")}
${ctaButton("Manage subscription", data.manageUrl)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `Your ${data.planLabel} plan (${gbp(data.amountPence)}) renews on ${data.dateLabel}.`,
    eyebrow: "Heads-up",
    title: "Your MileClear Pro renews soon",
    bodyHtml,
    footerHtml: plainFooterHtml(),
  });
  await deliver({
    email,
    subject: `Your MileClear Pro renews on ${data.dateLabel}`,
    html,
    userId,
    label: "Renewal reminder",
    gated: false,
  });
}

/** Subscription cancelled — win-back. */
export async function sendCancellationEmail(
  email: string,
  displayName: string | null | undefined,
  data: { accessUntilLabel: string },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para(`Your MileClear Pro subscription is cancelled. You'll keep full access until <strong style="color:#f0f2f5;">${escapeHtml(data.accessUntilLabel)}</strong>, then your account moves to the free plan.`)}
${para("Here's what goes quiet when it does:")}
${bulletList([
    "HMRC self-assessment <strong style=\"color:#f0f2f5;\">PDF export</strong>",
    "CSV earnings import &amp; Open Banking sync",
    "Business Insights &amp; Driving Analytics",
    "Unlimited vehicles &amp; saved locations",
  ])}
${para("Your trips, earnings and records all stay safe either way. Change your mind and you can reactivate any time - you'll pick up exactly where you left off.")}
${ctaButton("Reactivate Pro", "https://mileclear.com/dashboard/settings")}
${para("Mind sharing why you cancelled? Just reply - it genuinely helps me make MileClear better.", 8)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `Your Pro access continues until ${data.accessUntilLabel}. Here's what changes.`,
    eyebrow: "Sorry to see you go",
    title: "Your Pro is set to end",
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
  await deliver({
    email,
    subject: "Your MileClear Pro is set to end",
    html,
    userId,
    label: "Cancellation win-back",
    gated: true,
  });
}

// ── Trust / security / account ────────────────────────────────────────

/** New device sign-in alert. */
export async function sendNewLoginEmail(
  email: string,
  displayName: string | null | undefined,
  data: { deviceLabel: string; timeLabel: string; locationLabel?: string },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const rows: [string, string][] = [
    ["Device", escapeHtml(data.deviceLabel)],
    ["When", escapeHtml(data.timeLabel)],
  ];
  if (data.locationLabel) rows.push(["Near", escapeHtml(data.locationLabel)]);
  const bodyHtml = `
${para(greeting)}
${para("Your MileClear account was just signed in to on a new device:")}
${detailCard(rows)}
${para("If this was you, you're all set - no need to do anything.")}
${warningCard('Don\'t recognise this? <strong style="color:#fca5a5;">Change your password right away</strong> to keep your account secure.')}
${ctaButton("Secure my account", LOGIN_URL)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `New sign-in on ${data.deviceLabel}. If this wasn't you, secure your account.`,
    eyebrow: "Security",
    title: "New sign-in to your account",
    bodyHtml,
    footerHtml: plainFooterHtml(),
  });
  await deliver({
    email,
    subject: "New sign-in to your MileClear account",
    html,
    userId,
    label: "New login alert",
    gated: false,
  });
}

/** Password changed confirmation. */
export async function sendPasswordChangedEmail(
  email: string,
  displayName: string | null | undefined,
  data: { timeLabel: string },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para(`This confirms your MileClear password was changed on <strong style="color:#f0f2f5;">${escapeHtml(data.timeLabel)}</strong>.`)}
${para("If that was you, there's nothing more to do.")}
${warningCard('If you didn\'t change it, <strong style="color:#fca5a5;">reset your password now</strong> and email support@mileclear.com straight away.')}
${ctaButton("Reset password", LOGIN_URL)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: "Your MileClear password was just changed.",
    eyebrow: "Security",
    title: "Your password was changed",
    bodyHtml,
    footerHtml: plainFooterHtml(),
  });
  await deliver({
    email,
    subject: "Your MileClear password was changed",
    html,
    userId,
    label: "Password changed",
    gated: false,
  });
}

/** Email address changed confirmation (send to the OLD address). */
export async function sendEmailChangedEmail(
  email: string,
  displayName: string | null | undefined,
  data: { newEmail: string; timeLabel: string },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para(`The email address on your MileClear account was changed to <strong style="color:#f0f2f5;">${escapeHtml(data.newEmail)}</strong> on ${escapeHtml(data.timeLabel)}.`)}
${para("If you made this change, you're all set.")}
${warningCard("Didn't do this? Email support@mileclear.com immediately so we can secure your account.")}
${ctaButton("Contact support", SUPPORT_URL)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `Your account email was changed to ${data.newEmail}.`,
    eyebrow: "Security",
    title: "Your email address was changed",
    bodyHtml,
    footerHtml: plainFooterHtml(),
  });
  await deliver({
    email,
    subject: "Your MileClear email address was changed",
    html,
    userId,
    label: "Email changed",
    gated: false,
  });
}

/** GDPR data export ready to download. */
export async function sendDataExportReadyEmail(
  email: string,
  displayName: string | null | undefined,
  data: { downloadUrl: string; expiresLabel: string },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para("As requested, we've packaged up all of your MileClear data - trips, earnings, vehicles, fuel logs and account details - into a single file.")}
${ctaButton("Download my data", data.downloadUrl)}
${para(`For your security, this link expires on <strong style="color:#f0f2f5;">${escapeHtml(data.expiresLabel)}</strong>. After that, just request a fresh export from your settings.`)}
${para("Didn't request this? Let us know at support@mileclear.com.", 8)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: "Your MileClear data export is ready to download.",
    eyebrow: "Your data",
    title: "Your data export is ready",
    bodyHtml,
    footerHtml: plainFooterHtml(),
  });
  await deliver({
    email,
    subject: "Your MileClear data export is ready",
    html,
    userId,
    label: "Data export ready",
    gated: false,
  });
}

/** Account deletion confirmation. */
export async function sendAccountDeletedEmail(
  email: string,
  displayName: string | null | undefined,
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para("This confirms your MileClear account and all associated data - trips, earnings, vehicles and personal details - have been permanently deleted. Any active subscription has been cancelled.")}
${para("There's nothing else you need to do. We're sorry to see you go, and the door's always open if you'd like to come back.")}
${ctaButton("Create a new account", "https://mileclear.com/register")}
${para("If you didn't request this, contact support@mileclear.com immediately.", 8)}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: "Your MileClear account and data have been permanently deleted.",
    eyebrow: "Account closed",
    title: "Your account has been deleted",
    bodyHtml,
    footerHtml: plainFooterHtml(),
  });
  await deliver({
    email,
    subject: "Your MileClear account has been deleted",
    html,
    userId,
    label: "Account deleted",
    gated: false,
  });
}

// ── Loops & delight ───────────────────────────────────────────────────

/** Referral reward earned (friend made their first trip). */
export async function sendReferralRewardEmail(
  email: string,
  displayName: string | null | undefined,
  data: { friendName?: string; proUntilLabel: string },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const friend = data.friendName
    ? escapeHtml(data.friendName)
    : "Someone you invited";
  const bodyHtml = `
${para(greeting)}
${para(`${friend} just took their first trip with MileClear - which means your referral counts. You've earned a <strong style="color:#f5a623;">free month of Pro</strong>, on the house.`)}
${successCard(`Your Pro access is now active until <strong style="color:#34d399;">${escapeHtml(data.proUntilLabel)}</strong>.`)}
${para("Want more free months? You can refer up to three friends - every one who starts tracking earns you another month of Pro.")}
${ctaButton("Invite more friends", "https://mileclear.com/dashboard/settings")}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: `You've earned a free month of Pro - active until ${data.proUntilLabel}.`,
    eyebrow: "Reward unlocked",
    title: "You've earned a free month of Pro",
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
  await deliver({
    email,
    subject: "You've earned a free month of MileClear Pro",
    html,
    userId,
    label: "Referral reward",
    gated: true,
  });
}

/** "You asked, we built it" — a requested feature shipped. */
export async function sendFeatureShippedEmail(
  email: string,
  displayName: string | null | undefined,
  data: {
    featureTitle: string;
    featureBody: string;
    ctaUrl?: string;
    ctaLabel?: string;
  },
  userId: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const bodyHtml = `
${para(greeting)}
${para("A while back, someone using MileClear asked for this - and now it's live.")}
${para(escapeHtml(data.featureBody))}
${ctaButton(data.ctaLabel ? escapeHtml(data.ctaLabel) : "Check it out", data.ctaUrl ?? DASHBOARD_URL)}
${replyCard("Got another idea? Reply and tell me - this feature exists because someone did exactly that.")}
${SIGN_OFF}`;
  const html = emailShell({
    preheader: escapeHtml(data.featureTitle),
    eyebrow: "You asked, we built it",
    title: escapeHtml(data.featureTitle),
    bodyHtml,
    footerHtml: unsubscribeFooterHtml(userId),
  });
  await deliver({
    email,
    subject: `You asked, we built it: ${data.featureTitle}`,
    html,
    userId,
    label: "Feature shipped",
    gated: true,
  });
}

// ── Admin Briefing & Alert Emails ─────────────────────────────────────

export interface BriefingData {
  period: { from: Date; to: Date };
  // Users
  registrations: number;
  logins: number;
  loginFailures: number;
  verifications: number;
  // Activity
  tripsCreated: number;
  tripsDeleted: number;
  shiftsStarted: number;
  shiftsCompleted: number;
  // Revenue
  earningsCreated: number;
  csvImports: number;
  openBankingSyncs: number;
  // Exports
  exportsCsv: number;
  exportsPdf: number;
  exportsSelfAssessment: number;
  // Billing
  checkoutsCreated: number;
  subscriptionsActivated: number;
  subscriptionsCancelled: number;
  appleIapValidated: number;
  // Health
  errors500: number;
  slowRequests: number;
  // Totals
  totalUsers: number;
  newUsers: number;
  totalTrips24h: number;
  // New user details
  newUserList: { email: string; displayName: string | null; method: string }[];
}

function briefingRow(label: string, value: number, highlight = false): string {
  const color = highlight && value > 0 ? "#f5a623" : "#c0c8d4";
  return `<tr>
    <td style="padding: 6px 12px; color: #9ca3af; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.04);">${label}</td>
    <td style="padding: 6px 12px; color: ${color}; font-size: 14px; font-weight: 600; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.04);">${value}</td>
  </tr>`;
}

function briefingSection(title: string, rows: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr><td style="padding: 8px 12px; color: #f5a623; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${title}</td><td></td></tr>
      ${rows}
    </table>`;
}

export async function sendAdminBriefingEmail(
  email: string,
  briefing: BriefingData
): Promise<void> {
  const dateStr = briefing.period.from.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const newUsersHtml = briefing.newUserList.length > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
        <tr><td style="padding: 8px 12px; color: #f5a623; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">New Users</td></tr>
        ${briefing.newUserList.map((u) => `<tr><td style="padding: 4px 12px; color: #c0c8d4; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.04);">${escapeHtml(u.displayName || "No name")} - ${escapeHtml(u.email)} <span style="color: #6b7280;">(${u.method})</span></td></tr>`).join("")}
       </table>`
    : "";

  const subject = `MileClear Daily Briefing - ${dateStr}`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712;">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%;">

  <tr><td align="center" style="padding: 16px 0 24px;">
    <img src="https://mileclear.com/branding/logo-120x120.png" alt="MileClear" width="40" height="40" style="display: block; border: 0; border-radius: 8px;" />
  </td></tr>

  <tr><td style="background-color: #0a1120; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); padding: 28px 24px;">

    <h1 style="margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #f0f2f5;">Daily Briefing</h1>
    <p style="margin: 0 0 24px; color: #6b7280; font-size: 13px;">${dateStr} - Last 24 hours</p>

    ${briefingSection("Users", [
      briefingRow("New registrations", briefing.registrations, true),
      briefingRow("Logins", briefing.logins),
      briefingRow("Email verifications", briefing.verifications),
      briefingRow("Failed logins", briefing.loginFailures, true),
    ].join(""))}

    ${newUsersHtml}

    ${briefingSection("Activity", [
      briefingRow("Trips created", briefing.tripsCreated, true),
      briefingRow("Trips deleted", briefing.tripsDeleted),
      briefingRow("Shifts started", briefing.shiftsStarted),
      briefingRow("Shifts completed", briefing.shiftsCompleted),
    ].join(""))}

    ${briefingSection("Earnings", [
      briefingRow("Manual entries", briefing.earningsCreated),
      briefingRow("CSV imports", briefing.csvImports),
      briefingRow("Open Banking syncs", briefing.openBankingSyncs),
    ].join(""))}

    ${briefingSection("Exports", [
      briefingRow("CSV downloads", briefing.exportsCsv),
      briefingRow("PDF reports", briefing.exportsPdf),
      briefingRow("Self-assessment PDFs", briefing.exportsSelfAssessment),
    ].join(""))}

    ${briefingSection("Billing", [
      briefingRow("Checkout sessions", briefing.checkoutsCreated),
      briefingRow("New subscriptions", briefing.subscriptionsActivated, true),
      briefingRow("Cancellations", briefing.subscriptionsCancelled, true),
      briefingRow("Apple IAP validated", briefing.appleIapValidated),
    ].join(""))}

    ${briefingSection("Health", [
      briefingRow("500 errors", briefing.errors500, true),
      briefingRow("Slow requests (>2s)", briefing.slowRequests, true),
    ].join(""))}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0 0; background: rgba(245,166,35,0.06); border-radius: 8px; padding: 12px;">
      <tr>
        <td style="padding: 4px 12px; color: #9ca3af; font-size: 13px;">Total users</td>
        <td style="padding: 4px 12px; color: #f0f2f5; font-size: 14px; font-weight: 700; text-align: right;">${briefing.totalUsers}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px; color: #9ca3af; font-size: 13px;">Trips in last 24h</td>
        <td style="padding: 4px 12px; color: #f0f2f5; font-size: 14px; font-weight: 700; text-align: right;">${briefing.totalTrips24h}</td>
      </tr>
    </table>

  </td></tr>

  <tr><td align="center" style="padding: 20px 0 8px;">
    <p style="color: #4a5568; font-size: 11px; margin: 0;">MileClear Admin Briefing - sent daily at 8am</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  if (!transporter) {
    console.log(`[EMAIL] Admin briefing for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM, to: email, subject, html });
}

export async function sendErrorAlertEmail(
  errorCount: number
): Promise<void> {
  // Send to all admin users
  const { prisma } = await import("../lib/prisma.js");
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { email: true },
  });

  if (admins.length === 0) return;

  const subject = `MileClear Alert: ${errorCount} server errors in the last hour`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712;">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width: 480px; width: 100%;">
  <tr><td style="background-color: #0a1120; border-radius: 16px; border: 1px solid rgba(239,68,68,0.3); padding: 28px 24px;">
    <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 700; color: #ef4444;">Error Alert</h1>
    <p style="color: #c0c8d4; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      <strong style="color: #f0f2f5;">${errorCount} server errors</strong> have occurred in the last hour. This exceeds the threshold of 10.
    </p>
    <p style="color: #9ca3af; font-size: 13px; margin: 0;">Check PM2 logs for details: <code style="color: #f5a623;">pm2 logs mileclear-api --lines 100</code></p>
  </td></tr>
  <tr><td align="center" style="padding: 16px 0;">
    <p style="color: #4a5568; font-size: 11px; margin: 0;">MileClear Error Alert - max 1 per 30 minutes</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  if (!transporter) {
    console.log(`[EMAIL] Error alert: ${errorCount} errors`);
    return;
  }

  for (const admin of admins) {
    await transporter.sendMail({ from: FROM, to: admin.email, subject, html }).catch((err) =>
      console.error(`[EMAIL] Failed to send error alert to ${admin.email}:`, err)
    );
  }
}

export async function sendCheckinEmail(
  email: string,
  displayName: string | null | undefined,
  stats: { totalTrips: number; totalMiles: number } | null | undefined,
  userId: string
): Promise<void> {
  if (!(await isMarketingAllowed(userId))) return;
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";

  const hasTrips = stats && stats.totalTrips > 0;
  const heroLine = hasTrips
    ? `You've already logged <strong style="color: #f5a623;">${stats!.totalTrips} trip${stats!.totalTrips !== 1 ? "s" : ""}</strong> and <strong style="color: #f5a623;">${stats!.totalMiles.toFixed(1)} miles</strong>. Nice start!`
    : "Just checking in to see how things are going with MileClear.";

  const subject = hasTrips
    ? "Quick check-in from MileClear"
    : "How's it going with MileClear?";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712;">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%;">
  <tr><td align="center" style="padding: 24px 0 32px;">
    <img src="https://mileclear.com/branding/logo-120x120.png" alt="MileClear" width="56" height="56" style="display: block; border: 0; border-radius: 12px;" />
  </td></tr>
  <tr><td style="background-color: #0a1120; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height: 3px; background: linear-gradient(90deg, #f5a623, #e8950f); border-radius: 16px 16px 0 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 36px 32px 32px;">
        <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 700; color: #f0f2f5;">Quick check-in</h1>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${heroLine}</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">I wanted to check in and make sure everything's working well for you. If anything's confusing, broken, or could be better, I genuinely want to hear about it.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.15); border-radius: 10px; padding: 18px 20px;">
            <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;"><strong style="color: #f5a623;">Got a question?</strong> Just hit reply. I read every email and I'll get back to you personally. No support tickets, no bots.</p>
          </td></tr>
        </table>

        ${!hasTrips ? `<p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">If you haven't had a chance to try tracking yet, just open the app and drive. MileClear detects your trips automatically in the background - no buttons to press.</p>` : ""}

        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0;">Cheers,</p>
        <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding: 28px 0 8px;">
    <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">${unsubscribeFooterHtml(userId)}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  if (!transporter) {
    console.log(`[EMAIL] Check-in email for ${email}`);
    return;
  }

  await transporter.sendMail({
    from: FROM_PERSONAL,
    to: email,
    replyTo: "gair@mileclear.com",
    subject,
    html,
    headers: unsubscribeHeaders(userId),
  });
}

export async function sendFeedbackAcknowledgement(
  email: string,
  displayName?: string | null,
  feedbackTitle?: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const titleRef = feedbackTitle ? ` - "<em>${escapeHtml(feedbackTitle)}</em>"` : "";

  const subject = "Got your feedback - thanks!";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712;">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%;">
  <tr><td align="center" style="padding: 24px 0 32px;">
    <img src="https://mileclear.com/branding/logo-120x120.png" alt="MileClear" width="56" height="56" style="display: block; border: 0; border-radius: 12px;" />
  </td></tr>
  <tr><td style="background-color: #0a1120; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height: 3px; background: linear-gradient(90deg, #10b981, #059669); border-radius: 16px 16px 0 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 36px 32px 32px;">
        <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 700; color: #f0f2f5;">Thanks for the feedback!</h1>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">I've received your submission${titleRef} and I'll take a look. Your input directly shapes what gets built next in MileClear.</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">If you want to add more detail or have follow-up thoughts, just reply to this email.</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0;">Cheers,</p>
        <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding: 28px 0 8px;">
    <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">MileClear Feedback Acknowledgement</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  if (!transporter) {
    console.log(`[EMAIL] Feedback acknowledgement for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM_PERSONAL, to: email, replyTo: "gair@mileclear.com", subject, html });
}

export async function sendFeedbackReplyNotification(
  email: string,
  displayName: string | null | undefined,
  feedbackTitle: string,
  replyBody: string
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";

  const subject = `Reply to your feedback - "${feedbackTitle.slice(0, 60)}"`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712;">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%;">
  <tr><td align="center" style="padding: 24px 0 32px;">
    <img src="https://mileclear.com/branding/logo-120x120.png" alt="MileClear" width="56" height="56" style="display: block; border: 0; border-radius: 12px;" />
  </td></tr>
  <tr><td style="background-color: #0a1120; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height: 3px; background: linear-gradient(90deg, #f5a623, #ca8a04); border-radius: 16px 16px 0 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 36px 32px 32px;">
        <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 700; color: #f0f2f5;">You got a reply!</h1>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">I've replied to your feedback: "<em>${escapeHtml(feedbackTitle)}</em>"</p>
        <div style="background-color: rgba(245,166,35,0.08); border-left: 3px solid #f5a623; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 0 0 20px;">
          <p style="color: #f0f2f5; font-size: 15px; line-height: 1.7; margin: 0;">${escapeHtml(replyBody)}</p>
        </div>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">Open the app to see the full thread, or just reply to this email if you have more thoughts.</p>
        <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0;">Cheers,</p>
        <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding: 28px 0 8px;">
    <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">MileClear Feedback Reply</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  if (!transporter) {
    console.log(`[EMAIL] Feedback reply notification for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM_PERSONAL, to: email, replyTo: "gair@mileclear.com", subject, html });
}

export async function sendWaitlistConfirmation(
  email: string
): Promise<void> {
  const subject = "You're on the MileClear waitlist!";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 8px;">You're on the list!</h2>
      <p style="color: #555; font-size: 15px; line-height: 1.5;">Thanks for signing up for MileClear. We'll let you know as soon as it's ready.</p>
      <p style="color: #555; font-size: 15px; line-height: 1.5;">MileClear helps UK gig workers track mileage, calculate HMRC deductions, and save time on tax returns  - all from your phone.</p>
      <p style="color: #888; font-size: 13px;">If you didn't sign up, you can ignore this email.</p>
    </div>
  `;

  if (!transporter) {
    console.log(`[EMAIL] Waitlist confirmation for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM, to: email, subject, html });
}

export async function sendAccountantInviteEmail(
  email: string,
  inviterName: string,
  token: string
): Promise<void> {
  const safeInviterName = escapeHtml(inviterName);
  const dashboardUrl = `${process.env.API_BASE_URL || "https://mileclear.com"}/accountant/${token}`;
  const subject = `${inviterName} shared their MileClear data with you`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background-color: #030712; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712;">
        <tr><td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%;">

            <!-- Header with logo -->
            <tr><td align="center" style="padding: 24px 0 32px;">
              <img src="https://mileclear.com/branding/logo-120x120.png" alt="MileClear" width="56" height="56" style="display: block; border: 0; border-radius: 12px;" />
            </td></tr>

            <!-- Main card -->
            <tr><td style="background-color: #0a1120; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <!-- Amber top accent bar -->
                <tr><td style="height: 3px; background: linear-gradient(90deg, #f5a623, #e8950f); border-radius: 16px 16px 0 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>

                <!-- Content -->
                <tr><td style="padding: 36px 32px 32px;">

                  <h1 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: #f0f2f5;"><span style="color: #f5a623;">${safeInviterName}</span> shared their mileage data with you</h1>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${safeInviterName} has invited you to view their mileage, expenses, and tax data on MileClear. Click below to access their read-only dashboard.</p>

                  <!-- CTA button -->
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 28px;">
                    <tr><td style="border-radius: 8px; background: linear-gradient(135deg, #f5a623, #e8950f);">
                      <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 700; color: #030712; text-decoration: none; border-radius: 8px;">View Dashboard</a>
                    </td></tr>
                  </table>

                  <!-- Info callout -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                    <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.15); border-radius: 10px; padding: 18px 20px;">
                      <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;">This is a read-only view. You can see trip summaries, mileage deductions, expenses, and download exports. No account required.</p>
                    </td></tr>
                  </table>

                  <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0;">If you weren't expecting this invitation, you can safely ignore this email. The link will expire in 7 days.</p>

                </td></tr>
              </table>
            </td></tr>

            <!-- Footer -->
            <tr><td align="center" style="padding: 28px 0 8px;">
              <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">Sent via <a href="https://mileclear.com" style="color: #f5a623; text-decoration: none;">MileClear</a> - mileage tracking for UK drivers.</p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  if (!transporter) {
    console.log(`[EMAIL] Accountant invite for ${email} from ${inviterName} (dev only)`);
    return;
  }

  await transporter.sendMail({ from: FROM, to: email, subject, html });
}
