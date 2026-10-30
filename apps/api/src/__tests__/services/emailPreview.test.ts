/**
 * Email preview harness (Oct 2026 email redesign).
 *
 * Renders every driver-facing email in services/email.ts by calling the real
 * send* functions with sample data for a UK driver called Sam. Nothing is
 * sent: the Resend transport is switched on with a fake key and global fetch
 * is stubbed to capture the JSON payload (subject + html) instead of posting
 * it. Any fetch to another host throws. Prisma is mocked, so no database is
 * ever touched (the repo-root .env DATABASE_URL is PRODUCTION).
 *
 * Every captured email must have a subject, a non-empty body and the company
 * line ("SOYO Studios Ltd").
 *
 * To look at them:
 *   EMAIL_PREVIEW_DIR=/some/dir npx vitest run src/services/__tests__/emailPreview.test.ts
 * writes <dir>/<function-name>.html for each email plus <dir>/index.html.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Before email.ts loads: the transporter is decided at module load, so the
// Resend key must be set first, and the Brevo transports must stay off.
vi.hoisted(() => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.BREVO_API_KEY;
  delete process.env.BREVO_SMTP_USER;
  delete process.env.BREVO_SMTP_KEY;
});

// isMarketingAllowed reads users.marketingEmailsEnabled; say yes, never query.
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ marketingEmailsEnabled: true }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// The Exim/Brevo SMTP fallbacks must never open a socket.
vi.mock("nodemailer", () => {
  const createTransport = vi.fn(() => ({
    sendMail: vi.fn(async () => {
      throw new Error("emailPreview harness: SMTP transport must not be used");
    }),
  }));
  return { default: { createTransport }, createTransport };
});

type Captured = { subject: string; html: string; to: unknown };
type Rendered = { name: string; subject: string; html: string };

const captured: Captured[] = [];

const fetchStub = vi.fn(async (input: unknown, init?: { body?: unknown }) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String((input as { url?: string })?.url);
  if (!url.startsWith("https://api.resend.com/emails")) {
    throw new Error(`emailPreview harness: blocked fetch to ${url}`);
  }
  const payload = JSON.parse(String(init?.body ?? "{}"));
  captured.push({ subject: payload.subject ?? "", html: payload.html ?? "", to: payload.to });
  return new Response(JSON.stringify({ id: "test" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

const EMAIL = "sam.driver@example.com";
const NAME = "Sam";
const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("email preview harness", () => {
  let email: typeof import("../../services/email.js");
  const rendered: Rendered[] = [];
  const failures: string[] = [];
  let savedNodeEnv: string | undefined;

  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchStub);
    email = await import("../../services/email.js");
    savedNodeEnv = process.env.NODE_ENV;
    // send*/deliver() return early under NODE_ENV=test.
    process.env.NODE_ENV = "development";
  });

  afterAll(() => {
    process.env.NODE_ENV = savedNodeEnv;
    vi.unstubAllGlobals();
  });

  async function capture(name: string, fn: () => Promise<unknown>): Promise<void> {
    captured.length = 0;
    try {
      await fn();
    } catch (err) {
      failures.push(`${name}: threw ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (captured.length !== 1) {
      failures.push(`${name}: expected 1 email, captured ${captured.length}`);
      if (captured.length === 0) return;
    }
    rendered.push({ name, subject: captured[0].subject, html: captured[0].html });
  }

  it("renders every driver-facing email", async () => {
    const e = email;
    const pdf = Buffer.from("%PDF-1.4\n% emailPreview harness placeholder\n");
    const invoiceUser = {
      id: USER_ID,
      email: EMAIL,
      displayName: NAME,
      fullName: "Sam Taylor",
      tradingName: "Sam Taylor Couriers",
    };
    const invoice = {
      company: "Northern Parcels Ltd",
      invoiceNumber: 42,
      amountPence: 48650,
      sentAt: new Date("2026-10-01T09:00:00Z"),
      dueAt: new Date("2026-10-31T09:00:00Z"),
      reference: "PO-7781",
    };

    // Account + auth
    await capture("sendVerificationEmail", () => e.sendVerificationEmail(EMAIL, "482913"));
    await capture("sendPasswordResetEmail", () => e.sendPasswordResetEmail(EMAIL, "739104"));
    await capture("sendWelcomeEmail", () => e.sendWelcomeEmail(EMAIL, NAME));
    await capture("sendProWelcomeEmail", () => e.sendProWelcomeEmail(EMAIL, NAME, "apple"));
    await capture("sendNewLoginEmail", () =>
      e.sendNewLoginEmail(EMAIL, NAME, { deviceLabel: "iPhone 15", timeLabel: "Thursday 29 October, 08:14", locationLabel: "Leeds, UK" }, USER_ID)
    );
    await capture("sendPasswordChangedEmail", () =>
      e.sendPasswordChangedEmail(EMAIL, NAME, { timeLabel: "Thursday 29 October, 08:20" }, USER_ID)
    );
    await capture("sendEmailChangedEmail", () =>
      e.sendEmailChangedEmail(EMAIL, NAME, { newEmail: "sam.new@example.com", timeLabel: "Thursday 29 October, 08:25" }, USER_ID)
    );
    await capture("sendDataExportReadyEmail", () =>
      e.sendDataExportReadyEmail(
        EMAIL,
        NAME,
        { downloadUrl: "https://api.mileclear.com/user/export/download/sample-token", expiresLabel: "Saturday 31 October" },
        USER_ID
      )
    );
    await capture("sendAccountDeletedEmail", () => e.sendAccountDeletedEmail(EMAIL, NAME, USER_ID));

    // Lifecycle + engagement
    await capture("sendReEngagementEmail", () =>
      e.sendReEngagementEmail(EMAIL, NAME, { totalTrips: 63, totalMiles: 812.4 }, USER_ID)
    );
    await capture("sendUpdateEmail", () => e.sendUpdateEmail(EMAIL, NAME, USER_ID));
    await capture("sendServiceStatusEmail", () => e.sendServiceStatusEmail(EMAIL, NAME, USER_ID));
    await capture("sendCustomEmail", () =>
      e.sendCustomEmail(
        EMAIL,
        NAME,
        {
          subject: "Your November mileage, sorted",
          eyebrow: "Count every mile",
          title: "November is your busiest month",
          bodyMarkdown:
            "Short drops add up. Last November the average driver logged **412 miles**.\n\n- Leave recording on\n- Sort trips once a week\n\nThat's it.",
          ctaLabel: "Open MileClear",
          ctaUrl: "https://mileclear.com/dashboard",
          preheader: "Short drops add up",
          includeGreeting: true,
          includeSignoff: true,
        },
        USER_ID,
        true
      )
    );
    await capture("sendLocationPermissionEmail", () => e.sendLocationPermissionEmail(EMAIL, NAME, USER_ID));
    await capture("sendFirstTripEmail", () =>
      e.sendFirstTripEmail(EMAIL, NAME, { distanceMiles: 7.3, deductionPence: 402 }, USER_ID)
    );
    await capture("sendWeeklyRecapEmail", () =>
      e.sendWeeklyRecapEmail(EMAIL, NAME, { weekLabel: "19 to 25 October", trips: 34, miles: 286.7, claimPence: 15769 }, USER_ID)
    );
    await capture("sendTaxMilestoneEmail", () =>
      e.sendTaxMilestoneEmail(
        EMAIL,
        NAME,
        { taxYear: "2026-27", milestonePence: 100000, claimPence: 101310, businessMiles: 1842, audience: "self_employed" },
        USER_ID
      )
    );
    await capture("sendTaxYearEndSummaryEmail", () =>
      e.sendTaxYearEndSummaryEmail(
        EMAIL,
        NAME,
        { taxYear: "2025-26", businessMiles: 11240, trips: 1388, claimPence: 480999, audience: "self_employed" },
        USER_ID
      )
    );
    await capture("sendMtdQuarterlyReminderEmail", () =>
      e.sendMtdQuarterlyReminderEmail(
        EMAIL,
        NAME,
        { periodLabel: "6 July to 5 October 2026", dueLabel: "Saturday 7 November 2026", daysLeft: 9 },
        USER_ID
      )
    );
    await capture("sendSelfAssessmentDeadlineEmail", () =>
      e.sendSelfAssessmentDeadlineEmail(
        EMAIL,
        NAME,
        {
          deadlineLabel: "The Self Assessment filing deadline",
          dateLabel: "31 January 2027",
          daysLeft: 30,
          actionLine: "file your 2025-26 return and pay any tax due",
          returnYear: "2025-26",
          claimPence: 480999,
          audience: "self_employed",
        },
        USER_ID
      )
    );
    await capture("sendUnclassifiedTripsNudgeEmail", () =>
      e.sendUnclassifiedTripsNudgeEmail(EMAIL, NAME, { count: 17, potentialClaimPence: 6215 }, USER_ID)
    );
    await capture("sendWeekOneEmail", () =>
      e.sendWeekOneEmail(EMAIL, NAME, { trips: 21, miles: 164.2, claimPence: 9031, toSort: 5 }, USER_ID)
    );
    await capture("sendWinBackEmail-stopped", () =>
      e.sendWinBackEmail(
        EMAIL,
        NAME,
        {
          group: "stopped",
          sinceLabel: "6 October",
          changes: ["Trips finish on their own, even with the app closed", "Home shows your claim so far this tax year"],
          claimPence: 52480,
        },
        USER_ID
      )
    );
    await capture("sendWinBackEmail-never", () =>
      e.sendWinBackEmail(
        EMAIL,
        NAME,
        {
          group: "never",
          sinceLabel: "August",
          changes: ["Recording starts by itself when you drive", "Android is now on the Play Store"],
          claimPence: null,
          appDeleted: true,
        },
        USER_ID
      )
    );
    await capture("sendGoneQuietEmail", () =>
      e.sendGoneQuietEmail(EMAIL, NAME, { lastTripLabel: "Tuesday 20 October", android: false, claimPence: 52480 }, USER_ID)
    );
    await capture("sendCheckinEmail", () =>
      e.sendCheckinEmail(EMAIL, NAME, { totalTrips: 63, totalMiles: 812.4 }, USER_ID)
    );
    for (const reason of ["web_only", "no_permission", "no_drive_yet"] as const) {
      await capture(`sendActivationNudgeEmail-${reason}`, () =>
        e.sendActivationNudgeEmail(EMAIL, NAME, { reason, platform: "ios" }, USER_ID)
      );
    }
    await capture("sendBgLocationNudgeEmail-ios", () =>
      e.sendBgLocationNudgeEmail(EMAIL, NAME, { platform: "ios" }, USER_ID)
    );
    await capture("sendBgLocationNudgeEmail-android", () =>
      e.sendBgLocationNudgeEmail(EMAIL, NAME, { platform: "android" }, USER_ID)
    );
    await capture("sendReferralRewardEmail", () =>
      e.sendReferralRewardEmail(EMAIL, NAME, { friendName: "Jo", proUntilLabel: "29 November 2026" }, USER_ID)
    );
    await capture("sendFeatureShippedEmail", () =>
      e.sendFeatureShippedEmail(
        EMAIL,
        NAME,
        {
          featureTitle: "Which car, from its Bluetooth",
          featureBody: "MileClear now knows which of your cars you are in from the car's Bluetooth, so trips land on the right vehicle.",
          ctaUrl: "https://mileclear.com/dashboard",
          ctaLabel: "See it in the app",
        },
        USER_ID
      )
    );

    // Billing
    await capture("sendPaymentFailedEmail", () =>
      e.sendPaymentFailedEmail(EMAIL, NAME, { amountPence: 499, manageUrl: "https://mileclear.com/dashboard/settings" }, USER_ID)
    );
    await capture("sendRenewalReminderEmail", () =>
      e.sendRenewalReminderEmail(
        EMAIL,
        NAME,
        { planLabel: "MileClear Pro (yearly)", amountPence: 4499, dateLabel: "5 November 2026", manageUrl: "https://mileclear.com/dashboard/settings" },
        USER_ID
      )
    );
    await capture("sendCancellationEmail", () =>
      e.sendCancellationEmail(EMAIL, NAME, { accessUntilLabel: "28 November 2026" }, USER_ID)
    );

    // Feedback
    await capture("sendFeedbackAcknowledgement", () =>
      e.sendFeedbackAcknowledgement(EMAIL, NAME, "Let me set a default vehicle per platform")
    );
    await capture("sendFeedbackReplyNotification", () =>
      e.sendFeedbackReplyNotification(
        EMAIL,
        NAME,
        "Let me set a default vehicle per platform",
        "Thanks Sam. That's a good one. I've added it to the list and will tell you when it ships."
      )
    );
    await capture("sendFeedbackShippedNotification", () =>
      e.sendFeedbackShippedNotification(
        EMAIL,
        NAME,
        "Let me set a default vehicle per platform",
        "Settings > Vehicles now has a default per platform."
      )
    );

    // Waitlist + teams + accountants
    await capture("sendWaitlistConfirmation", () => e.sendWaitlistConfirmation(EMAIL));
    await capture("sendWaitlistConfirmation-android", () => e.sendWaitlistConfirmation(EMAIL, { android: true }));
    await capture("sendDrivingTimesNoticeEmail", () =>
      e.sendDrivingTimesNoticeEmail(EMAIL, NAME, "Northern Parcels Ltd", new Date("2026-09-14T09:00:00Z"), USER_ID)
    );
    await capture("sendTeamInviteEmail-driver", () =>
      e.sendTeamInviteEmail(EMAIL, "Northern Parcels Ltd", "sample-team-invite-token", "driver")
    );
    await capture("sendTeamInviteEmail-admin", () =>
      e.sendTeamInviteEmail(EMAIL, "Northern Parcels Ltd", "sample-team-invite-token", "admin")
    );
    await capture("sendAccountantInviteEmail", () =>
      e.sendAccountantInviteEmail("accounts@example.com", "Sam Taylor", "sample-accountant-token")
    );
    await capture("sendInvoiceEmail-send", () =>
      e.sendInvoiceEmail({ user: invoiceUser, invoice, toEmail: "accounts@northernparcels.example", pdf, kind: "send" })
    );
    await capture("sendInvoiceEmail-chase_1", () =>
      e.sendInvoiceEmail({
        user: invoiceUser,
        invoice,
        toEmail: "accounts@northernparcels.example",
        pdf,
        kind: "chase_1",
        chaseBodyText:
          "Hi,\n\nJust a reminder that invoice INV-0042 for £486.50 was due on 31 October.\n\nCould you let me know when it will be paid?\n\nThanks,\nSam",
      })
    );
    await capture("sendTeamMonthReadyEmail", () =>
      e.sendTeamMonthReadyEmail(EMAIL, "Northern Parcels Ltd", "October 2026", "sample-approve-token")
    );
    await capture("sendTeamApprovalRequestEmail", () =>
      e.sendTeamApprovalRequestEmail("manager@example.com", {
        orgName: "Northern Parcels Ltd",
        monthLabel: "October 2026",
        driverNames: "Sam and Jo",
        driverCount: 2,
        totalMiles: 1284.6,
        totalAmountPence: 57807,
        approveToken: "sample-approve-token",
      })
    );
    await capture("sendManagerNominationEmail", () =>
      e.sendManagerNominationEmail("manager@example.com", "Sam Taylor", "Northern Parcels Ltd", "sample-nomination-token")
    );
    await capture("sendMilesheetWaitlistEmail", () =>
      e.sendMilesheetWaitlistEmail("manager@example.com", "Priya", "Northern Parcels Ltd")
    );
    await capture("sendMilesheetTrialEndingEmail", () =>
      e.sendMilesheetTrialEndingEmail("manager@example.com", "Northern Parcels Ltd", 3, new Date("2026-11-01T00:00:00Z"))
    );
    await capture("sendPracticeClientInviteEmail", () =>
      e.sendPracticeClientInviteEmail({
        to: EMAIL,
        practiceName: "Hartley & Co Accountants",
        inviterName: "Priya Hartley",
        url: "https://mileclear.com/practice/join/sample-client-token",
      })
    );
    await capture("sendPracticeStaffInviteEmail", () =>
      e.sendPracticeStaffInviteEmail({
        to: "staff@example.com",
        practiceName: "Hartley & Co Accountants",
        inviterName: "Priya Hartley",
        url: "https://mileclear.com/practice/staff/sample-staff-token",
      })
    );
    await capture("sendPracticeAccountantInviteEmail", () =>
      e.sendPracticeAccountantInviteEmail({
        to: "accounts@example.com",
        driverName: "Sam Taylor",
        url: "https://mileclear.com/practice/accept/sample-accountant-token",
      })
    );
    await capture("sendPracticeNoticeEmail", () =>
      e.sendPracticeNoticeEmail({
        to: EMAIL,
        subject: "Hartley & Co Accountants can now see your records",
        title: "Your accountant is connected",
        lines: [
          "Hartley & Co Accountants accepted your invite and can now see your business trips, earnings and expenses, read only.",
          "You can stop sharing at any time from Settings.",
        ],
        ctaLabel: "Open MileClear",
        ctaUrl: "https://mileclear.com/dashboard",
      })
    );

    // Render-only: the custom email body as the admin preview builds it.
    {
      const args = {
        subject: "Your November mileage, sorted",
        title: "November is your busiest month",
        bodyMarkdown: "Short drops add up. Leave recording on and sort trips once a week.",
        ctaLabel: "Open MileClear",
        ctaUrl: "https://mileclear.com/dashboard",
        includeGreeting: true,
        includeSignoff: true,
      };
      try {
        rendered.push({ name: "renderCustomEmailHtml", subject: args.subject, html: e.renderCustomEmailHtml(args, NAME, USER_ID) });
      } catch (err) {
        failures.push(`renderCustomEmailHtml: threw ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Write previews when asked.
    const dir = process.env.EMAIL_PREVIEW_DIR;
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      for (const r of rendered) fs.writeFileSync(path.join(dir, `${r.name}.html`), r.html);
      const rows = rendered
        .map((r) => {
          const missing = r.html.includes("SOYO Studios Ltd") ? "" : ' <strong style="color:#c00">(no company line)</strong>';
          return `<li><a href="${encodeURIComponent(r.name)}.html">${esc(r.name)}</a> - ${esc(r.subject)}${missing}</li>`;
        })
        .join("\n");
      fs.writeFileSync(
        path.join(dir, "index.html"),
        `<!doctype html><html><head><meta charset="utf-8"><title>MileClear email previews</title>` +
          `<style>body{font-family:-apple-system,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;line-height:1.7}</style></head>` +
          `<body><h1>MileClear email previews (${rendered.length})</h1><ol>\n${rows}\n</ol></body></html>`
      );
    }

    // Assertions, gathered so one run lists every problem.
    for (const r of rendered) {
      if (!r.subject.trim()) failures.push(`${r.name}: empty subject`);
      if (!r.html.trim()) failures.push(`${r.name}: empty html`);
      else if (!r.html.includes("SOYO Studios Ltd")) failures.push(`${r.name}: missing company line ("SOYO Studios Ltd")`);
    }
    // Only the Resend endpoint was ever called (other hosts throw above).
    for (const call of fetchStub.mock.calls) {
      expect(String(call[0])).toMatch(/^https:\/\/api\.resend\.com\/emails/);
    }
    expect(failures, `Email preview problems:\n${failures.join("\n")}`).toEqual([]);
    expect(rendered.length).toBeGreaterThan(40);
  });
});
