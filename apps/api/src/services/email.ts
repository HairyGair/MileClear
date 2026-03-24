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
const FROM_PERSONAL = "Gair - MileClear <gair@mileclear.com>";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">Thanks for signing up! MileClear is built to make mileage tracking effortless for UK gig workers and self-employed drivers. Here's what you can do:</p>

                  <!-- Feature list -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Track your miles</strong>  - automatic GPS tracking while you work</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">HMRC deductions</strong>  - calculated at the correct rates, ready for your tax return</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Log earnings</strong>  - keep everything in one place</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Export reports</strong>  - PDF, CSV, or straight to your accountancy software</td>
                      </tr></table>
                    </td></tr>
                  </table>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 24px;"><strong style="color: #f0f2f5;">To get started:</strong> add a vehicle, then start your first shift  - the app handles the rest.</p>

                  <!-- Feedback callout -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 28px;">
                    <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.15); border-radius: 10px; padding: 18px 20px;">
                      <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;">MileClear is always a work in progress and your input genuinely shapes what gets built next. If you have any suggestions, feature requests, or spot something that could be better, head to the <strong style="color: #f5a623;">Suggestions</strong> section in the app  - or just reply to this email. I read every message.</p>
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

export async function sendReEngagementEmail(
  email: string,
  displayName?: string | null,
  stats?: { totalTrips: number; totalMiles: number } | null
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";

  // Personalise based on whether they've used the app
  const hasUsed = stats && stats.totalTrips > 0;
  const heroLine = hasUsed
    ? `You've already tracked <strong style="color: #f5a623;">${stats!.totalTrips} trip${stats!.totalTrips !== 1 ? "s" : ""}</strong> and <strong style="color: #f5a623;">${stats!.totalMiles.toFixed(1)} miles</strong>  - nice work! Here's a quick reminder of what MileClear can do for you.`
    : "We noticed you haven't recorded your first trip yet. Here's a quick reminder of what MileClear can do for you.";

  const subject = hasUsed
    ? "Your miles are adding up  - here's what's new in MileClear"
    : "You're all set up  - ready to track your first trip?";

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

                  <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 700; color: #f0f2f5;">${hasUsed ? "Your MileClear Update" : "Don't Forget About <span style=\"color: #f5a623;\">MileClear</span>"}</h1>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${heroLine}</p>

                  <!-- Feature reminders -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Automatic trip recording</strong>  - just drive and MileClear detects your trips in the background. No buttons to press</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">HMRC tax deductions</strong>  - 45p/mile calculated automatically, ready for your self-assessment</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Fuel costs &amp; nearby prices</strong>  - log fill-ups and find the cheapest fuel near you from 8,300+ UK stations</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Achievements &amp; streaks</strong>  - earn badges, hit milestones, and track your driving consistency</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding: 10px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width: 32px; vertical-align: top; padding-top: 1px; color: #f5a623; font-size: 16px;">&#9672;</td>
                        <td style="color: #c0c8d4; font-size: 14px; line-height: 1.6;"><strong style="color: #f0f2f5;">Works for everyone</strong>  - whether you're a gig driver claiming tax or just want to track personal driving and costs</td>
                      </tr></table>
                    </td></tr>
                  </table>

                  ${!hasUsed ? `
                  <!-- CTA for new users -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                    <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.15); border-radius: 10px; padding: 18px 20px;">
                      <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;"><strong style="color: #f5a623;">Quick tip:</strong> Make sure background location is set to "Always" in your phone settings so MileClear can detect your trips automatically. Then just open the app, and you're good to go.</p>
                    </td></tr>
                  </table>` : `
                  <!-- CTA for active users -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                    <tr><td style="background-color: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.15); border-radius: 10px; padding: 18px 20px;">
                      <p style="color: #d4b87a; font-size: 14px; line-height: 1.65; margin: 0;"><strong style="color: #f5a623;">What's new in Build 27:</strong> Smarter automatic trip detection, fewer false notifications, and quiet hours between 10pm&ndash;7am so we won't disturb you at night.</p>
                    </td></tr>
                  </table>`}

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 8px;">Got feedback? Just reply to this email  - I read every message.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 16px 0 0;">Cheers,</p>
                  <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>

                </td></tr>
              </table>
            </td></tr>

            <!-- Footer -->
            <tr><td align="center" style="padding: 28px 0 8px;">
              <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">You're receiving this because you have a MileClear account.<br/>If you'd rather not receive these emails, reply with "unsubscribe" and we'll remove you.</p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  if (!transporter) {
    console.log(`[EMAIL] Re-engagement email for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM_PERSONAL, to: email, replyTo: "gair@mileclear.com", subject, html });
}

export async function sendUpdateEmail(
  email: string,
  displayName?: string | null
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const subject = "What's new in MileClear";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#333;">
<h2 style="color:#1a1a1a;margin:0 0 20px;">What's new in MileClear</h2>
<p>${greeting}</p>
<p>We've just pushed a big update. Here's what's changed:</p>
<ul style="padding-left:20px;line-height:1.8;">
<li><strong>Driver or Passenger?</strong> - When we detect a journey, you'll get a notification asking if you're the driver or a passenger. Passenger trips are ignored automatically.</li>
<li><strong>Accurate trip end times</strong> - Trip end times now show when you actually stopped driving, not when you opened the app.</li>
<li><strong>Annual plan</strong> - Save 25% with yearly billing.</li>
<li><strong>Better sign-in reliability</strong> - No more unnecessary logouts.</li>
<li><strong>Delete trips</strong> - Long-press any trip to remove it.</li>
<li><strong>Export fix</strong> - Auto-detected trips now show your vehicle correctly in PDF and CSV exports.</li>
</ul>
<p>Want to know the thinking behind these changes? Check out our new <a href="https://mileclear.com/updates" style="color:#f5a623;">Updates &amp; Blog</a> page.</p>
<p>As always, if anything doesn't feel right or you've got ideas, just reply to this email.</p>
<p>Cheers,<br/><strong>Gair</strong></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px;"/>
<p style="color:#999;font-size:12px;">You're receiving this because you have a MileClear account. Reply with "unsubscribe" to opt out.</p>
</div>`;

  if (!transporter) {
    console.log(`[EMAIL] Update email for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM_PERSONAL, to: email, replyTo: "gair@mileclear.com", subject, html });
}

export async function sendServiceStatusEmail(
  email: string,
  displayName?: string | null
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi there,";
  const subject = "MileClear is back up and running";
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

                  <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 700; color: #f0f2f5;">We're Back <span style="color: #10b981;">&#10003;</span></h1>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${greeting}</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">Just a quick heads-up  - you may have experienced some issues signing in or syncing earlier today. Our server had a hiccup, but everything is now back up and running as normal.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;"><strong style="color: #f0f2f5;">No data was lost.</strong> All your trips, earnings, and records are safe. The app should work normally now  - just open it up and you're good to go.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">If you were tracking a trip when the issue happened, any locally recorded data will sync automatically next time you open the app.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 0 0 8px;">Sorry for any inconvenience, and thanks for your patience. If anything still seems off, just reply to this email.</p>

                  <p style="color: #c0c8d4; font-size: 15px; line-height: 1.7; margin: 16px 0 0;">Cheers,</p>
                  <p style="color: #f0f2f5; font-size: 15px; font-weight: 600; margin: 4px 0 0;">Gair</p>

                </td></tr>
              </table>
            </td></tr>

            <!-- Footer -->
            <tr><td align="center" style="padding: 28px 0 8px;">
              <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">You're receiving this because you have a MileClear account.<br/>If you'd rather not receive these emails, reply with "unsubscribe" and we'll remove you.</p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  if (!transporter) {
    console.log(`[EMAIL] Service status email for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM_PERSONAL, to: email, replyTo: "gair@mileclear.com", subject, html });
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
  displayName?: string | null,
  stats?: { totalTrips: number; totalMiles: number } | null
): Promise<void> {
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
    <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">You're receiving this because you have a MileClear account.<br/>Reply with "unsubscribe" to opt out of check-in emails.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  if (!transporter) {
    console.log(`[EMAIL] Check-in email for ${email}`);
    return;
  }

  await transporter.sendMail({ from: FROM_PERSONAL, to: email, replyTo: "gair@mileclear.com", subject, html });
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
