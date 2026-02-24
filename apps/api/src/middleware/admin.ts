import { FastifyRequest, FastifyReply } from "fastify";

export async function adminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.isAdmin) {
    return reply.status(403).send({ error: "Admin access required" });
  }
}
