import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { getBusinessInsights, getWeeklyPnL } from "../../services/businessInsights.js";

export async function businessInsightRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /business-insights — full business intelligence dashboard data
  app.get("/", async (request, reply) => {
    const insights = await getBusinessInsights(request.userId!);
    return reply.send({ data: insights });
  });

  // GET /business-insights/pnl?weeksBack=0 — weekly P&L statement
  app.get("/pnl", async (request, reply) => {
    const { weeksBack } = z
      .object({ weeksBack: z.coerce.number().int().min(0).max(52).default(0) })
      .parse(request.query);

    const pnl = await getWeeklyPnL(request.userId!, weeksBack);
    return reply.send({ data: pnl });
  });
}
