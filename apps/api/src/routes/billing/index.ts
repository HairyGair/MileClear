import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";

export async function billingRoutes(app: FastifyInstance) {
  // Webhook doesn't need auth (verified by Stripe signature)
  app.post("/webhook", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/status", { preHandler: authMiddleware }, async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/checkout", { preHandler: authMiddleware }, async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/cancel", { preHandler: authMiddleware }, async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
