import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import {
  getStats,
  getAchievements,
  getShiftScorecard,
  getPeriodRecap,
} from "../../services/gamification.js";

const scorecardQuery = z.object({
  shiftId: z.string().uuid().optional(),
});

const recapQuery = z.object({
  period: z.enum(["weekly", "monthly"]).default("weekly"),
  date: z.coerce.date().optional(),
});

export async function gamificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/stats", async (request, reply) => {
    const userId = request.userId!;
    const data = await getStats(userId);
    return reply.send({ data });
  });

  app.get("/achievements", async (request, reply) => {
    const userId = request.userId!;
    const data = await getAchievements(userId);
    return reply.send({ data });
  });

  app.get("/scorecard", async (request, reply) => {
    const parsed = scorecardQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const data = await getShiftScorecard(userId, parsed.data.shiftId);

    if (!data) {
      return reply.status(404).send({ error: "No completed shift found" });
    }

    return reply.send({ data });
  });

  app.get("/recap", async (request, reply) => {
    const parsed = recapQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const data = await getPeriodRecap(
      userId,
      parsed.data.period,
      parsed.data.date
    );
    return reply.send({ data });
  });
}
