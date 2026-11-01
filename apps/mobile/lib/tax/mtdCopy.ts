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

/** Shown when HMRC has no self-employment business for the driver. No raw IDs. */
export const NO_TRADE_COPY = {
  title: "HMRC doesn't have a self-employed business for you yet",
  body: "Quarterly updates are sent against your self-employed business on your HMRC record. HMRC doesn't show one for the National Insurance number you gave us. This usually means you haven't registered as self-employed with HMRC yet, or it's still being set up. Once HMRC shows your business, tap Check again. If you're sure you're registered, check the National Insurance number is yours.",
  retryLabel: "Check again",
  backLabel: "Back",
} as const;
