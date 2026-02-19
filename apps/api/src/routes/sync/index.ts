import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";

export async function syncRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.post("/push", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/status", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
