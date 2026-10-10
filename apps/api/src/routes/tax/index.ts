import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { loadTaxOverview } from "../../services/taxOverview.js";

/**
 * GET /tax/overview: the Tax tab and the Home tax line, one request. Free,
 * auth only. All figures come from existing services (services/taxOverview.ts).
 *
 * Query: `fresh=1` skips the 30 second cache (pull to refresh). `asOf=YYYY-MM-DD`
 * is honoured for admins only, to check the February to April lead.
 */
export async function taxRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/overview", async (request, reply) => {
    const q = request.query as { asOf?: string; fresh?: string };
    let now: Date | undefined;
    if (q.asOf && request.isAdmin) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.asOf)) {
        return reply.status(400).send({ error: "asOf must be YYYY-MM-DD" });
      }
      const d = new Date(`${q.asOf}T12:00:00Z`);
      if (Number.isNaN(d.getTime())) return reply.status(400).send({ error: "asOf must be a real date" });
      now = d;
    }
    const data = await loadTaxOverview(request.userId!, { now, fresh: q.fresh === "1" });
    if (!data) return reply.status(404).send({ error: "User not found" });
    return reply.send({ data });
  });
}
