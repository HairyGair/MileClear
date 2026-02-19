import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";

export async function earningRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.post("/", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/csv", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/ocr", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/open-banking", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/open-banking", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
