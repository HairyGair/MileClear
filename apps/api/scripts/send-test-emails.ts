// One-off: send the redesigned + new campaign/lifecycle emails to Anthony.
// Run: cd apps/api && npx tsx --env-file=../../.env scripts/send-test-emails.ts [group]
//   group = "core" (original 3) | "new" (16 new) | "all" (default) | "lifecycle" (18 Oct rewording + retention pair)
import {
  sendReEngagementEmail,
  sendUpdateEmail,
  sendServiceStatusEmail,
  sendLocationPermissionEmail,
  sendFirstTripEmail,
  sendWeeklyRecapEmail,
  sendTaxYearEndSummaryEmail,
  sendSelfAssessmentDeadlineEmail,
  sendUnclassifiedTripsNudgeEmail,
  sendPaymentFailedEmail,
  sendRenewalReminderEmail,
  sendCancellationEmail,
  sendNewLoginEmail,
  sendPasswordChangedEmail,
  sendEmailChangedEmail,
  sendDataExportReadyEmail,
  sendAccountDeletedEmail,
  sendReferralRewardEmail,
  sendFeatureShippedEmail,
  sendTaxMilestoneEmail,
  sendWeekOneEmail,
  sendGoneQuietEmail,
} from "../src/services/email.js";

const TO = "anthonygair@icloud.com";
const NAME = "Anthony";
// Throwaway userId — isMarketingAllowed() returns true for an unknown id.
const UID = "test-preview-0000-0000-000000000000";
const MANAGE_URL = "https://mileclear.com/dashboard/settings";

const group = process.argv[2] ?? "all";

// The lifecycle set as reworded 18 Oct 2026, plus the two retention emails.
async function lifecycle() {
  await sendUnclassifiedTripsNudgeEmail(TO, NAME, { count: 12, potentialClaimPence: 5400 }, UID);
  await sendWeeklyRecapEmail(TO, NAME, { weekLabel: "12 - 18 Oct", trips: 14, miles: 173.6, claimPence: 9548 }, UID);
  await sendTaxMilestoneEmail(TO, NAME, { taxYear: "2026-27", milestonePence: 50000, claimPence: 51230, businessMiles: 931, audience: "self_employed" }, UID);
  await sendTaxMilestoneEmail(TO, NAME, { taxYear: "2026-27", milestonePence: 25000, claimPence: 26010, businessMiles: 650, audience: "employee" }, UID);
  await sendTaxYearEndSummaryEmail(TO, NAME, { taxYear: "2026-27", businessMiles: 8420, trips: 612, claimPence: 431000, audience: "self_employed" }, UID);
  await sendSelfAssessmentDeadlineEmail(TO, NAME, {
    deadlineLabel: "The Self Assessment filing deadline", dateLabel: "31 January 2027", daysLeft: 30,
    actionLine: "file your 2025-26 return and pay any tax due", returnYear: "2025-26", claimPence: 120000, audience: "self_employed",
  }, UID);
  await sendWeekOneEmail(TO, NAME, { trips: 9, miles: 64.2, claimPence: 2140, toSort: 7 }, UID);
  await sendWeekOneEmail(TO, NAME, { trips: 6, miles: 41.0, claimPence: null, toSort: 0 }, UID);
  await sendGoneQuietEmail(TO, NAME, { lastTripLabel: "Tuesday 6 October", android: false, claimPence: 41250 }, UID);
  await sendGoneQuietEmail(TO, NAME, { lastTripLabel: "Tuesday 6 October", android: true, claimPence: null }, UID);
}

async function core() {
  await sendReEngagementEmail(TO, NAME, { totalTrips: 47, totalMiles: 612.4 }, UID);
  await sendReEngagementEmail(TO, NAME, { totalTrips: 0, totalMiles: 0 }, UID);
  await sendUpdateEmail(TO, NAME, UID);
  await sendServiceStatusEmail(TO, NAME, UID);
}

async function fresh() {
  // Activation + retention
  await sendLocationPermissionEmail(TO, NAME, UID);
  await sendFirstTripEmail(TO, NAME, { distanceMiles: 8.3, deductionPence: 457 }, UID);
  await sendWeeklyRecapEmail(
    TO,
    NAME,
    { weekLabel: "26 May - 1 Jun", trips: 14, miles: 173.6, claimPence: 9548 },
    UID
  );
  // Tax / HMRC
  await sendTaxYearEndSummaryEmail(
    TO,
    NAME,
    { taxYear: "2025-26", businessMiles: 8420, trips: 612, claimPence: 379000, audience: "self_employed" },
    UID
  );
  await sendSelfAssessmentDeadlineEmail(
    TO,
    NAME,
    {
      deadlineLabel: "The Self Assessment filing deadline",
      dateLabel: "31 January 2027",
      daysLeft: 21,
      actionLine: "file your 2025-26 return and pay any tax due",
      returnYear: "2025-26",
      claimPence: 379000,
      audience: "self_employed",
    },
    UID
  );
  await sendUnclassifiedTripsNudgeEmail(
    TO,
    NAME,
    { count: 12, potentialClaimPence: 5400 },
    UID
  );
  // Billing
  await sendPaymentFailedEmail(TO, NAME, { amountPence: 499, manageUrl: MANAGE_URL }, UID);
  await sendRenewalReminderEmail(
    TO,
    NAME,
    { planLabel: "Pro Annual", amountPence: 4499, dateLabel: "18 June 2026", manageUrl: MANAGE_URL },
    UID
  );
  await sendCancellationEmail(TO, NAME, { accessUntilLabel: "18 June 2026" }, UID);
  // Trust / security / account
  await sendNewLoginEmail(
    TO,
    NAME,
    { deviceLabel: "iPhone 16 Pro - Safari", timeLabel: "3 Jun 2026, 10:24", locationLabel: "Newcastle, UK" },
    UID
  );
  await sendPasswordChangedEmail(TO, NAME, { timeLabel: "3 Jun 2026, 10:24" }, UID);
  await sendEmailChangedEmail(
    TO,
    NAME,
    { newEmail: "new.address@example.com", timeLabel: "3 Jun 2026, 10:24" },
    UID
  );
  await sendDataExportReadyEmail(
    TO,
    NAME,
    { downloadUrl: "https://api.mileclear.com/user/export/download?token=demo", expiresLabel: "10 June 2026" },
    UID
  );
  await sendAccountDeletedEmail(TO, NAME, UID);
  // Loops & delight
  await sendReferralRewardEmail(TO, NAME, { friendName: "Sam", proUntilLabel: "3 July 2026" }, UID);
  await sendFeatureShippedEmail(
    TO,
    NAME,
    {
      featureTitle: "One-tap trip merge",
      featureBody:
        "When detection splits one journey into two, MileClear now suggests merging them - tap once and they become a single, accurate trip with the right mileage.",
      ctaUrl: "https://mileclear.com/dashboard/trips",
      ctaLabel: "Try it out",
    },
    UID
  );
}

async function main() {
  if (group === "core" || group === "all") await core();
  if (group === "new" || group === "all") await fresh();
  if (group === "lifecycle") await lifecycle();
  console.log(`Done (${group}). Sent to ${TO}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
