import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { getBusinessInsights, getWeeklyPnL } from "../../services/businessInsights.js";
import { buildTaxSnapshot } from "../../services/taxSnapshot.js";

export async function businessInsightRoutes(app: FastifyInstance) {
  // Auth required for all routes; premium gate applied per-route below so
  // the free tax-snapshot can sit alongside the premium intelligence ones.
  app.addHook("preHandler", authMiddleware);

  // GET /business-insights — full business intelligence dashboard data (Pro)
  app.get("/", { preHandler: premiumMiddleware }, async (request, reply) => {
    const insights = await getBusinessInsights(request.userId!);
    return reply.send({ data: insights });
  });

  // GET /business-insights/pnl?weeksBack=0 — weekly P&L statement (Pro)
  app.get("/pnl", { preHandler: premiumMiddleware }, async (request, reply) => {
    const { weeksBack } = z
      .object({ weeksBack: z.coerce.number().int().min(0).max(52).default(0) })
      .parse(request.query);

    const pnl = await getWeeklyPnL(request.userId!, weeksBack);
    return reply.send({ data: pnl });
  });

  // GET /business-insights/tax-snapshot — dashboard tax position (free)
  // The "this app keeps me out of trouble in January" hook for all users.
  app.get("/tax-snapshot", async (request, reply) => {
    const snapshot = await buildTaxSnapshot(request.userId!);
    return reply.send({ data: snapshot });
  });
}
