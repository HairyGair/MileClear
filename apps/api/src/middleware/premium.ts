import { FastifyRequest, FastifyReply } from "fastify";
import { cacheGet, cacheSet, cacheDel } from "../lib/redis.js";
import { unauthorized, premiumRequired } from "../lib/apiError.js";
import { isProUser } from "../services/proEntitlement.js";

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
  // Effective Pro = active subscription OR banked referral credit OR an
  // active membership of an entitled team (free pilot or subscribed org).
  // The rule lives in services/proEntitlement.ts so the free caps and the
  // profile answer exactly the same question as this gate.
  const entitled = await isProUser(request.userId);

  if (!entitled) {
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
