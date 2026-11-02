import { isApiError } from "../api/apiError";

/**
 * HMRC codes that mean "there is nothing there for this year", as opposed to
 * "we couldn't ask". Only these may show an empty history. Every other error
 * (the server refusing a device it can't describe, HMRC being down, a bad
 * request) must be shown as an error, or a failure reads as "you sent nothing".
 */
const NOTHING_SUBMITTED_CODES = new Set([
  // HMRC: no submissions or calculations found for the year.
  "MATCHING_RESOURCE_NOT_FOUND",
  // Plain 404 from our server.
  "NOT_FOUND",
  // HMRC doesn't take this tax year through software, so nothing can exist.
  "RULE_TAX_YEAR_NOT_SUPPORTED",
]);

/** True only when an error from an HMRC history read means "nothing submitted yet". */
export function isNothingSubmittedError(err: unknown): boolean {
  return isApiError(err) && NOTHING_SUBMITTED_CODES.has(err.code);
}

/**
 * Turn a failed HMRC read into the words to show and whether trying again
 * could help. The server's own message is used where there is one, because
 * it says what is actually wrong (for example "update the app"). Retrying is
 * only suggested when the server says it might work, or when we never
 * reached the server at all.
 */
export function describeMtdLoadError(
  err: unknown,
  fallback: string,
): { message: string; canRetry: boolean } {
  if (isApiError(err)) {
    const canRetry = err.retryable || err.statusCode >= 500 || err.statusCode === 429;
    return { message: err.message || fallback, canRetry };
  }
  return { message: fallback, canRetry: true };
}

/**
 * Body text for the quarterly updates card when the open updates couldn't be
 * loaded. Leads with the reason, only says "pull down to try again" when that
 * could help, and always says a failure is not the same as nothing to file.
 */
export function obligationsErrorText(
  reason: { message: string; canRetry: boolean } | null,
): string {
  const lead = reason?.message ?? "We couldn't load your quarterly updates just now.";
  const retry = reason?.canRetry === false ? "" : " Pull down to try again.";
  return `${lead}${retry} Until then we can't tell you whether anything is due. This does not mean you have nothing to file.`;
}

/** True when the stored HMRC token has run out. Missing or placeholder dates count as unknown, not expired. */
export function isConnectionExpired(expiresAt: string | undefined | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return false;
  return d.getTime() <= now.getTime();
}

/** The HMRC environment the server reports, or null while it isn't known yet. */
export type HmrcEnv = "sandbox" | "production" | null | undefined;

/**
 * True only when the server is connected to HMRC's real service. Sandbox and
 * "not known yet" both read false, so callers pick test wording only when
 * they know it's sandbox (see isMtdTest) and neutral wording while unknown.
 */
export function isMtdLive(env: HmrcEnv): boolean {
  return env === "production";
}

/** True only when the server is known to be on HMRC's test service. */
export function isMtdTest(env: HmrcEnv): boolean {
  return env === "sandbox";
}

/** One line on the quarterly updates header explaining the token. */
export function connectionLine(
  expiresAt: string | undefined | null,
  _formatted: string,
  now: Date = new Date(),
  env: HmrcEnv = "sandbox",
): string {
  const live = isMtdLive(env);
  if (isConnectionExpired(expiresAt, now)) {
    return live
      ? "Your connection to HMRC has expired. Connect again to carry on."
      : "Your test connection has expired. Connect again to carry on.";
  }
  return live
    ? "Your connection renews by itself while you use it."
    : "Your test connection renews by itself while you use it.";
}

// ── Words that depend on which HMRC service the server uses ──────────────
// Unknown environment reads as the real-service wording (never "test"),
// because isMtdTest is only true when the server says sandbox.

/** Header title of the screen shown after an update is sent. */
export function sentScreenTitle(env: HmrcEnv): string {
  return isMtdTest(env) ? "Test update done" : "Update sent";
}

/** Alert title when sending an update fails. */
export function updateFailedTitle(env: HmrcEnv): string {
  return isMtdTest(env) ? "Test update failed" : "Update not sent";
}

/** Alert body when sending an update fails: the reason, then what to do next. */
export function updateFailedBody(env: HmrcEnv, reason: string | null | undefined): string {
  const lead = reason && reason.trim() ? reason.trim() : "Something went wrong.";
  const stop = /[.!?]$/.test(lead) ? lead : `${lead}.`;
  return isMtdTest(env)
    ? `${stop} Try again in a moment.`
    : `${stop} Check your figures and try again in a moment. If it keeps happening, tell us from More > Tell us about a problem or idea.`;
}

/** Small print under HMRC's tax estimate after an update. Not a projection. */
export function estimateDisclaimer(env: HmrcEnv): string {
  return isMtdTest(env)
    ? "Worked out by HMRC's test service from what you've sent so far. It goes up as you send more test updates."
    : "Worked out by HMRC from what you've sent so far. It goes up as you send the rest of the year.";
}

/** Heading for the list of updates on the hub. */
export const UPDATES_THIS_YEAR_HEADING = "Your updates this tax year";

// The no-business explainer now lives in mtdSetupCopy.ts (BUSINESS_NOT_FOUND).

// ── Check and send / sent screens (Nov 2026 redesign) ───────────────────
// Environment-dependent words for the two screens an update goes through.
// Unknown environment reads as the real-service wording, never "test".

export const CHECK_AND_SEND_TITLE = "Check and send";

/** Label on the main button of the Check and send screen. */
export function sendButtonLabel(env: HmrcEnv): string {
  return isMtdTest(env) ? "Send test update" : "Send to HMRC";
}

/** Title of the confirm alert before sending. */
export function confirmSendTitle(env: HmrcEnv): string {
  return isMtdTest(env) ? "Send test update?" : "Send to HMRC?";
}

/** Body of the confirm alert. `period` reads like "6 April to 5 October 2026". */
export function confirmSendBody(env: HmrcEnv, period: string): string {
  return isMtdTest(env)
    ? `This sends ${period} to HMRC's test service. Nothing reaches HMRC and your tax account is not changed.`
    : `This sends ${period}. You can correct it later if a figure is wrong.`;
}

/** Alert title when sending fails. */
export function couldntSendTitle(env: HmrcEnv): string {
  return isMtdTest(env) ? "Test update failed" : "Couldn't send";
}

/** Nav title of the sent screen. */
export function sentNavTitle(env: HmrcEnv): string {
  return isMtdTest(env) ? "Test update done" : "Sent";
}

/** Big heading on the sent screen. */
export function sentHeading(env: HmrcEnv): string {
  if (isMtdTest(env)) return "Test update complete";
  return isMtdLive(env) ? "HMRC has your update" : "Update sent";
}

/** Eyebrow over HMRC's figure. The figure always comes from HMRC's service. */
export function estimateEyebrow(taxYear: string, env: HmrcEnv): string {
  return isMtdTest(env) ? `TEST ESTIMATE FOR ${taxYear}` : `HMRC'S ESTIMATE FOR ${taxYear}`;
}

/** Small pill beside the estimate. */
export function estimateSourcePill(env: HmrcEnv): string {
  return isMtdTest(env) ? "From test service" : "From HMRC";
}

/** Shown while HMRC is working out the estimate. */
export function estimateWaitingText(env: HmrcEnv): string {
  return isMtdTest(env)
    ? "Asking the test service for your estimate... usually 10 to 30 seconds."
    : "Asking HMRC for your estimate... usually 10 to 30 seconds.";
}

/** Shown when the estimate didn't arrive. The update itself is not affected. */
export const ESTIMATE_FAILED_TEXT =
  "HMRC hasn't sent the estimate yet. It'll be in Update history. Your update isn't affected.";

export const MISTAKE_LATER_TEXT =
  "Spot a mistake later? Your next update carries the corrected totals, or you can resend this one from Update history.";

export const NOTHING_TO_PAY_COPY = {
  title: "Sending this doesn't charge you",
  body: "Your payment dates stay the same.",
  link: "See what you pay and when",
} as const;

export const RUNNING_TOTAL_TEXT =
  "Each update is a running total from 6 April, so this one includes the earlier months again. That's how HMRC wants it.";

export const SENT_SIGNPOST_TEXT = "You can also see this in your HMRC online account.";
