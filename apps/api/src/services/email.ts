// Email service using Resend (free tier: 3,000 emails/month)
// Falls back to console logging when RESEND_API_KEY is not set

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM || "MileClear <noreply@mileclear.com>";

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

  if (!resend) {
    console.log(`[EMAIL] Verification code for ${email}: ${code}`);
    return;
  }

  await resend.emails.send({ from: FROM, to: email, subject, html });
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

  if (!resend) {
    console.log(`[EMAIL] Password reset code for ${email}: ${code}`);
    return;
  }

  await resend.emails.send({ from: FROM, to: email, subject, html });
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

  if (!resend) {
    console.log(`[EMAIL] Waitlist confirmation for ${email}`);
    return;
  }

  await resend.emails.send({ from: FROM, to: email, subject, html });
}
