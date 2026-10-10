import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { loadMileageReliefData } from "../../services/mileageRelief.js";

/**
 * Mileage Allowance Relief for employees (free, no paywall). The work is in
 * services/mileageRelief.ts so /tax/overview returns exactly the same data.
 */
export async function mileageReliefRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/", async (request, reply) => {
    const data = await loadMileageReliefData(request.userId!, new Date());
    if (!data) return reply.status(404).send({ error: "User not found" });
    return reply.send({ data });
  });
}
