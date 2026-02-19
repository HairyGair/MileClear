import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";

export async function gamificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/stats", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/achievements", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/scorecard", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
