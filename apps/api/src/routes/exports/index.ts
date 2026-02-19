import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", premiumMiddleware);

  app.get("/self-assessment", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/csv", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/pdf", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/xero", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/freeagent", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/quickbooks", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
