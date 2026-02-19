import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";

export async function vehicleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.post("/", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.patch("/:id", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.delete("/:id", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/lookup", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
