import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";

export async function fuelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/prices", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/logs", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/logs", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
