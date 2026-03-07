import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import {
  getDrivingAnalytics,
  getWeeklyReport,
  getFrequentRoutes,
  getShiftSweetSpots,
  getFuelCostBreakdown,
  getEarningsByDay,
  getCommuteTiming,
} from "../../services/drivingAnalytics.js";

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /analytics — full driving analytics
  app.get("/", async (request, reply) => {
    const data = await getDrivingAnalytics(request.userId!);
    return reply.send({ data });
  });

  // GET /analytics/weekly-report?weeksBack=0
  app.get("/weekly-report", async (request, reply) => {
    const { weeksBack } = z
      .object({ weeksBack: z.coerce.number().int().min(0).max(52).default(0) })
      .parse(request.query);

    const data = await getWeeklyReport(request.userId!, weeksBack);
    return reply.send({ data });
  });

  // GET /analytics/routes
  app.get("/routes", async (request, reply) => {
    const data = await getFrequentRoutes(request.userId!);
    return reply.send({ data });
  });

  // GET /analytics/shift-sweet-spots
  app.get("/shift-sweet-spots", async (request, reply) => {
    const data = await getShiftSweetSpots(request.userId!);
    return reply.send({ data });
  });

  // GET /analytics/fuel-cost
  app.get("/fuel-cost", async (request, reply) => {
    const data = await getFuelCostBreakdown(request.userId!);
    return reply.send({ data });
  });

  // GET /analytics/earnings-by-day
  app.get("/earnings-by-day", async (request, reply) => {
    const data = await getEarningsByDay(request.userId!);
    return reply.send({ data });
  });

  // GET /analytics/commute-timing
  app.get("/commute-timing", async (request, reply) => {
    const data = await getCommuteTiming(request.userId!);
    return reply.send({ data });
  });
}
