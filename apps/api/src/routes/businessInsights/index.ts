import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { getBusinessInsights, getWeeklyPnL } from "../../services/businessInsights.js";
import { buildTaxSnapshot } from "../../services/taxSnapshot.js";
import { buildActivityHeatmap } from "../../services/activityHeatmap.js";
import { buildBenchmarkSnapshot } from "../../services/benchmarks.js";

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

  // GET /business-insights/heatmap?weeksBack=12&platform=uber — activity
  // heatmap of trips + earnings by day-of-week × hour-of-day (free).
  app.get("/heatmap", async (request, reply) => {
    const { weeksBack, platform } = z
      .object({
        weeksBack: z.coerce.number().int().min(1).max(52).default(12),
        platform: z.string().min(1).max(40).optional(),
      })
      .parse(request.query);

    const heatmap = await buildActivityHeatmap(request.userId!, {
      weeksBack,
      platform: platform ?? null,
    });
    return reply.send({ data: heatmap });
  });

  // GET /business-insights/benchmarks — anonymous comparison vs other UK
  // drivers (free). Privacy floor of 5 contributors per cell. Buckets light
  // up automatically as the user base grows.
  app.get("/benchmarks", async (request, reply) => {
    const snapshot = await buildBenchmarkSnapshot(request.userId!);
    return reply.send({ data: snapshot });
  });
}
