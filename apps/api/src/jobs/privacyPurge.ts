// Privacy purge cron (GDPR audit follow-up, 11 Oct 2026).
//
// Storage limitation: four tables only ever grew.
//
//   - refresh_tokens: every sign-in and every rotation writes a row, and
//     expired ones were never removed. Kept for a day past expiry so the
//     rotation-reuse leeway (see routes/auth) never meets a missing row.
//   - verification_codes / password_reset_tokens: 10-minute codes, kept
//     forever alongside the email change or reset they belonged to.
//   - route_cache: start and end points rounded to 4 decimal places (about
//     11 m), so a cached route between someone's home and work is close to
//     an address. The rows carry no user id, which is also why deleting an
//     account never touched them. A route nobody has asked for in
//     ROUTE_CACHE_MAX_IDLE_DAYS goes; asking again just routes it afresh.

import { prisma } from "../lib/prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TOKEN_GRACE_DAYS = 1;
export const ROUTE_CACHE_MAX_IDLE_DAYS = 90;

/** Pure: the cut-off dates for a run at `now`. */
export function privacyPurgeCutoffs(now: Date) {
  return {
    tokensExpiredBefore: new Date(now.getTime() - TOKEN_GRACE_DAYS * DAY_MS),
    routesIdleSince: new Date(now.getTime() - ROUTE_CACHE_MAX_IDLE_DAYS * DAY_MS),
  };
}

export async function runPrivacyPurgeJob(now = new Date()): Promise<void> {
  const { tokensExpiredBefore, routesIdleSince } = privacyPurgeCutoffs(now);

  const [refresh, verification, reset, routes] = await Promise.all([
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: tokensExpiredBefore } } }),
    prisma.verificationCode.deleteMany({ where: { expiresAt: { lt: tokensExpiredBefore } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: tokensExpiredBefore } } }),
    // Idle = never hit and computed before the cut-off, or last hit before it.
    prisma.routeCache.deleteMany({
      where: {
        OR: [
          { lastHitAt: null, computedAt: { lt: routesIdleSince } },
          { lastHitAt: { lt: routesIdleSince } },
        ],
      },
    }),
  ]);

  const total = refresh.count + verification.count + reset.count + routes.count;
  if (total > 0) {
    console.log(
      `[privacyPurge] Removed ${refresh.count} refresh token(s), ${verification.count} verification code(s), ` +
        `${reset.count} reset code(s), ${routes.count} idle cached route(s).`
    );
  }
}
