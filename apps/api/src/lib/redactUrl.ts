/**
 * Strip bearer credentials that travel in a URL path before anything logs it.
 *
 * Accountant links are the case that forced this (GDPR audit, 14 Aug 2026):
 * a 128-hex token in `/accountant/dashboard/<token>` is a working key to
 * someone's tax data, and it was reaching both the pino request log and the
 * `app_events` table through the slow-request and error handlers. Redacting
 * the Authorization header does nothing when the credential is in the path.
 *
 * Deliberately broad: any long hex run in a path segment is replaced, so a
 * future token-in-URL route is covered without anyone having to remember.
 * UUIDs (36 chars, hyphenated) are left alone — they are identifiers we
 * already log on purpose, and each hyphen-separated group is under 32.
 */
export function redactUrlSecrets(url: string): string {
  return redactNinoInPath(url.replace(/\/[0-9a-f]{32,}/gi, "/<redacted>"));
}

/**
 * A National Insurance Number as it appears INSIDE a URL path, unanchored.
 *
 * Deliberately a separate expression from the anchored NINO_REGEX that
 * validates user input in routes/hmrc: this one has to find a NINO in the
 * middle of a path, so it is bounded by the path separators and string edges
 * rather than by ^ and $. Same character classes, which are narrower than
 * "two letters" — HMRC excludes D, F, I, Q, U and V from the first letter and
 * O from the second — so a legitimate path segment is very unlikely to match.
 */
const NINO_IN_PATH =
  /(^|\/)([A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]?)(?=\/|$)/gi;

/**
 * Strip a NINO out of a URL path before anything logs it.
 *
 * Most MTD endpoints address the taxpayer by putting their NINO in the URL
 * (`/individuals/business/self-employment/{nino}/{businessId}/period`), so the
 * HMRC client logging its request path verbatim wrote a National Insurance
 * Number into `app_events` on EVERY call — the highest-frequency finding of the
 * 14 Aug GDPR audit, 114 rows across 2 users before it was caught. The path
 * itself is worth keeping: it says which endpoint was called, which is how the
 * submission trail gets reconstructed. The NINO in it is not, and we already
 * hold it encrypted on HmrcConnection for the times we genuinely need it.
 *
 * Composed into redactUrlSecrets above as well, so inbound request logging is
 * covered if a NINO ever reaches a route path (today it only ever arrives in a
 * POST body, which is not logged).
 */
export function redactNinoInPath(path: string): string {
  return path.replace(NINO_IN_PATH, (_m, lead: string) => `${lead}:nino`);
}
