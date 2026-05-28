import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
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

  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { isPremium: true, premiumExpiresAt: true, referralProUntil: true },
  });

  // Effective premium = active paid subscription OR banked referral credit.
  // resolvePremiumStatus never touches subscription state; it just ORs in
  // referralProUntil so earned free months unlock Pro without corrupting
  // Stripe/Apple tracking. It also handles the expired-subscription case
  // (isPremium true but premiumExpiresAt in the past -> not active).
  if (!user || !resolvePremiumStatus(user).active) {
    const err = premiumRequired(
      "MileClear Pro is required for this feature.",
      "Upgrade in Settings - or invite friends to earn free months."
    );
    return reply.status(err.statusCode).send(err.toBody(request.id));
  }
}
