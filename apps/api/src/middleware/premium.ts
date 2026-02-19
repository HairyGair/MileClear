import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function premiumMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.userId) {
    return reply.status(401).send({ error: "Not authenticated" });
  }

  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { isPremium: true, premiumExpiresAt: true },
  });

  if (!user?.isPremium) {
    return reply.status(403).send({ error: "Premium subscription required" });
  }

  if (user.premiumExpiresAt && user.premiumExpiresAt < new Date()) {
    return reply.status(403).send({ error: "Premium subscription expired" });
  }
}
