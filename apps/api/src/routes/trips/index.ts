import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";

export async function tripRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/:id", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.patch("/:id", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.delete("/:id", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
