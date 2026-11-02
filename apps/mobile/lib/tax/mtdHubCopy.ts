import { isMtdTest, type HmrcEnv } from "./mtdCopy";

// Words on the Quarterly updates hub. Kept apart from mtdCopy.ts so the other
// screens' copy changes don't collide with this one. Environment wording
// follows mtdCopy: unknown reads as the real service, only "sandbox" says test.

/** The quiet line at the top of the hub. */
export function hubConnectionLabel(env: HmrcEnv, expired: boolean, taxYear: string): string {
  if (expired) return isMtdTest(env) ? "Test connection expired" : "Connection expired";
  return isMtdTest(env)
    ? `Connected to HMRC's test service · ${taxYear}`
    : `Connected to HMRC · ${taxYear}`;
}

/** Title of the card for the quarter to send now. */
export function nextUpTitle(label: string): string {
  return `Send your ${label} update`;
}

/** Title of the card when that quarter is past its due date. */
export function lateTitle(label: string): string {
  return `Your ${label} update is late`;
}

/** True for tax years where HMRC isn't giving penalty points for late quarterly updates (2026-27). */
function noLatePenaltyPoints(taxYear: string): boolean {
  return Number(taxYear.slice(0, 4)) <= 2026;
}

/** Body of the late card. Only 2026-27 says anything about penalties. */
export function lateBody(taxYear: string): string {
  return noLatePenaltyPoints(taxYear)
    ? "For 2026-27, HMRC isn't giving penalty points for late quarterly updates. Send it as soon as you can."
    : "Send it as soon as you can.";
}

/** The "Send early" row, when the next period ends within 10 days. */
export function sendEarlyText(label: string): string {
  return `Your ${label} period ends soon. You can send it early.`;
}

/** Small print under the send button. */
export function sendReassurance(env: HmrcEnv): string {
  return isMtdTest(env)
    ? "About 2 minutes. This is the test version, so nothing reaches your real tax account."
    : "About 2 minutes. Nothing goes to HMRC until you tap Send.";
}

/** Title when nothing needs sending. */
export function upToDateTitle(allSent: boolean, sentCount: number, taxYear: string): string {
  return allSent ? `All ${sentCount} updates sent for ${taxYear}` : "You're up to date";
}

/** Body when nothing needs sending. `following` is the next quarter to come, if HMRC has listed one. */
export function upToDateBody(following: { label: string; dueText: string } | null): string {
  return following
    ? `Your next update is ${following.label}, due ${following.dueText}. We'll remind you 7 days and 1 day before.`
    : "Nothing more to send for this tax year. We'll show your next update here when HMRC lists it.";
}

/** Heading for the year timeline. */
export function yearHeading(taxYear: string): string {
  return `Your ${taxYear} year`;
}

/** "1 of 4 updates sent". */
export function sentProgressText(sent: number, total: number): string {
  return `${sent} of ${total} ${total === 1 ? "update" : "updates"} sent`;
}


/** Finishing the year isn't in the app yet. */
export const FINISH_YEAR_COPY = {
  label: "Finish the year",
  pill: "Not in app yet",
  title: "Finishing the year isn't in MileClear yet",
  body: "You'll do it with HMRC or other software. Your figures will be ready to copy from Tax > Self Assessment.",
} as const;

/** Sub line under "Finish the year". */
export function finishYearSub(deadlineText: string | null, env: HmrcEnv): string {
  if (isMtdTest(env)) return "Try the tax return in the test version";
  return deadlineText ? `By ${deadlineText}` : "Comes after the last update";
}

/** Attention row: trips still to sort before sending. */
export function tripsToMarkText(n: number, since: string = "6 April"): string {
  return `${n} ${n === 1 ? "trip" : "trips"} to mark since ${since}`;
}
