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
  return url.replace(/\/[0-9a-f]{32,}/gi, "/<redacted>");
}
