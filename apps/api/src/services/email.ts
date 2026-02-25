// Email service using Brevo SMTP relay (free tier: 300/day, ~9,000/month)
// Falls back to console logging when SMTP creds are not set

import nodemailer from "nodemailer";

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
const FROM_PERSONAL = "Gair — MileClear <gair@mileclear.com>";

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
      throw new Error("SMTP not configured — cannot send verification email in production");
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
      throw new Error("SMTP not configured — cannot send password reset email in production");
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
  const greeting = displayName ? `Hi ${displayName},` : "Hi there,";
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

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">Thanks for signing up! MileClear is built to make mileage tracking effortless for UK gig workers and self-employed drivers. Here's what you can do:</p>

                  <!-- Feature list -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Track your miles</strong> &mdash; automatic GPS tracking while you work</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">HMRC deductions</strong> &mdash; calculated at the correct rates, ready for your tax return</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Log earnings</strong> &mdash; keep everything in one place</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Export reports</strong> &mdash; PDF, CSV, or straight to your accountancy software</td>
                      </tr></table>
                    </td></tr>
                  </table>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 24px;"><strong style="color: #f0f2f5;">To get started:</strong> add a vehicle, then start your first shift &mdash; the app handles the rest.</p>

                  <!-- Feedback callout -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 28px;">
                    <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.15); border-radius: 10px; padding: 18px 20px;">
                      <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;">MileClear is always a work in progress and your input genuinely shapes what gets built next. If you have any suggestions, feature requests, or spot something that could be better, head to the <strong style="color: #f5a623;">Suggestions</strong> section in the app &mdash; or just reply to this email. I read every message.</p>
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

export async function sendWaitlistConfirmation(
  email: string
): Promise<void> {
  const subject = "You're on the MileClear waitlist!";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 8px;">You're on the list!</h2>
      <p style="color: #555; font-size: 15px; line-height: 1.5;">Thanks for signing up for MileClear. We'll let you know as soon as it's ready.</p>
      <p style="color: #555; font-size: 15px; line-height: 1.5;">MileClear helps UK gig workers track mileage, calculate HMRC deductions, and save time on tax returns — all from your phone.</p>
      <p style="color: #888; font-size: 13px;">If you didn't sign up, you can ignore this email.</p>
    </div>
  `;

  if (!transporter) {
    console.log(`[EMAIL] Waitlist confirmation for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM, to: email, subject, html });
}
