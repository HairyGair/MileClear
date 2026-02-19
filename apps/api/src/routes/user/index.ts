import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/profile", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.patch("/profile", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/export", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.delete("/account", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
