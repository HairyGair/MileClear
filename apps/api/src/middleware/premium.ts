import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { cacheGet, cacheSet, cacheDel } from "../lib/redis.js";
import { unauthorized, premiumRequired } from "../lib/apiError.js";
import { resolvePremiumStatus } from "../services/referral.js";

export async function premiumMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.userId) {
    const err = unauthorized("Not authenticated.");
    return reply.status(err.statusCode).send(err.toBody(request.id));
  }

  // Entitlement changes on the order of once a month, but this ran one or
  // two queries on every request to every Pro route. Sixty seconds of cache
  // is invisible to a user upgrading (webhooks clear it on the spot) and
  // removes the busiest read the middleware layer had.
  const cacheKey = `premium:${request.userId}`;
  const cached = await cacheGet(cacheKey);
  if (cached === "1") return; // active - let the request through
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { isPremium: true, premiumExpiresAt: true, referralProUntil: true },
  });

  // Effective premium = active paid subscription OR banked referral credit.
  // resolvePremiumStatus never touches subscription state; it just ORs in
  // referralProUntil so earned free months unlock Pro without corrupting
  // Stripe/Apple tracking. It also handles the expired-subscription case
  // (isPremium true but premiumExpiresAt in the past -> not active).
  // Milesheet: an active membership in an ENTITLED org grants Pro
  // without touching the user's own billing state - a disabled membership
  // takes it away again. Checked only when nothing personal grants Pro, so
  // paying users cost no extra query.
  let teamActive = false;
  if (!user || !resolvePremiumStatus(user).active) {
    // Membership alone is NOT entitlement. Self-serve org creation (Phase 3)
    // lets any signed-in user create a team and become its active admin
    // instantly, so granting Pro for a bare membership would hand out Pro to
    // anyone who typed a team name. The org itself must be entitled: either
    // an approved free pilot, or actually carrying a subscription.
    teamActive = !!(await prisma.orgMembership.findFirst({
      where: {
        userId: request.userId,
        status: "active",
        org: { OR: [{ pilotFree: true }, { stripeSubscriptionId: { not: null } }] },
      },
      select: { id: true },
    }));
  }

  if (!user || (!resolvePremiumStatus(user).active && !teamActive)) {
    const err = premiumRequired(
      "MileClear Pro is required for this feature.",
      "Upgrade in Settings - or invite friends to earn free months."
    );
    return reply.status(err.statusCode).send(err.toBody(request.id));
  }

  // Only the POSITIVE answer is cached. Caching a denial would lock a
  // fresh upgrade out of Pro routes for up to a minute at the exact
  // moment they have just paid.
  await cacheSet(cacheKey, "1", 60);
}

/** Call whenever a user's entitlement changes so the next request re-reads. */
export async function invalidatePremiumCache(userId: string): Promise<void> {
  await cacheDel(`premium:${userId}`);
}
