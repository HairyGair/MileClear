// The ONE answer to "does this user get Pro right now?".
//
// Pro comes from three places:
//   1. their own subscription (isPremium, and premiumExpiresAt null or in
//      the future) - Stripe, Apple, Google or a comp grant;
//   2. banked referral credit (referralProUntil in the future);
//   3. an ACTIVE membership of an ENTITLED team: an approved free pilot
//      (pilotFree), an org that carries a Stripe subscription, or an org
//      still inside its free trial (trialEndsAt in the future, Oct 2026;
//      the rule is isOrgEntitled in teamTrial.ts).
//
// 1 and 2 come from resolvePremiumStatus (services/referral.ts). 3 is the
// rule premiumMiddleware has applied since Milesheet teams shipped. Free
// caps (vehicles, saved locations, invoices) used to read only 1 or 1+2,
// so team and referral Pro users were capped like free users. Everything
// that gates on Pro should call this instead of re-deriving it.
//
// Admin revenue accounting lives in subscriptionTruth.ts and is separate:
// this is entitlement, not money.

import { prisma } from "../lib/prisma.js";
import { resolvePremiumStatus } from "./referral.js";
import { entitledOrgWhere } from "./teamTrial.js";

export type ProSource = "subscription" | "referral" | "team" | "none";

export interface ProEntitlement {
  isPro: boolean;
  source: ProSource;
  /** Expiry of the personal source when one applies; null for team/none. */
  until: Date | null;
}

export interface PersonalProFields {
  isPremium: boolean;
  premiumExpiresAt: Date | null;
  referralProUntil: Date | null;
}

export const PERSONAL_PRO_SELECT = {
  isPremium: true,
  premiumExpiresAt: true,
  referralProUntil: true,
} as const;

const NONE: ProEntitlement = { isPro: false, source: "none", until: null };

/**
 * Membership alone is NOT entitlement: anyone can create a team and become
 * its active admin, so the org itself must be a free pilot, carry a
 * subscription, or be inside its free trial. A disabled/invited membership
 * grants nothing, and a trial that has ended grants nothing.
 */
export async function hasEntitledTeamMembership(userId: string, now: Date = new Date()): Promise<boolean> {
  const membership = await prisma.orgMembership.findFirst({
    where: {
      userId,
      status: "active",
      org: entitledOrgWhere(now),
    },
    select: { id: true },
  });
  return !!membership;
}

/**
 * Resolve Pro for a user. Pass `user` when the caller already loaded the
 * three personal fields (saves a query); pass null when the lookup found
 * no row. The team query only runs when nothing personal grants Pro, so a
 * paying user costs at most one query.
 */
export async function getProEntitlement(
  userId: string,
  user?: PersonalProFields | null
): Promise<ProEntitlement> {
  const row =
    user === undefined
      ? await prisma.user.findUnique({ where: { id: userId }, select: PERSONAL_PRO_SELECT })
      : user;
  if (!row) return NONE;

  const personal = resolvePremiumStatus(row);
  if (personal.active) {
    return { isPro: true, source: personal.source, until: personal.until };
  }
  if (await hasEntitledTeamMembership(userId)) {
    return { isPro: true, source: "team", until: null };
  }
  return NONE;
}

export async function isProUser(
  userId: string,
  user?: PersonalProFields | null
): Promise<boolean> {
  return (await getProEntitlement(userId, user)).isPro;
}
