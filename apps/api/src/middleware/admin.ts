import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function adminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Always verify admin flag from database, not JWT claim
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
    return reply.status(403).send({ error: "Admin access required" });
  }
}
