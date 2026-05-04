import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { unauthorized, premiumRequired } from "../lib/apiError.js";

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
    select: { isPremium: true, premiumExpiresAt: true },
  });

  if (!user?.isPremium) {
    const err = premiumRequired();
    return reply.status(err.statusCode).send(err.toBody(request.id));
  }

  if (user.premiumExpiresAt && user.premiumExpiresAt < new Date()) {
    const err = premiumRequired(
      "Your MileClear Pro subscription has expired.",
      "Renew in Settings to restore tax exports, CSV import, and unlimited saved locations."
    );
    return reply.status(err.statusCode).send(err.toBody(request.id));
  }
}
