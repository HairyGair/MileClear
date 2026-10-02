import { FastifyInstance } from "fastify";
import { z } from "zod";
import { availableMonths, isMonthKey, latestCompleteMonth } from "../../services/communityMonthly.js";
import { getCommunityMonthly } from "../../services/communityMonthlyLoader.js";

// Community numbers: what the whole fleet did in one UK calendar month.
// Public (the mileclear.com/community page and the in-app card read it), so
// it returns aggregates only, behind a privacy floor of 10 drivers per
// figure; see services/communityMonthly.ts for every rule.

const querySchema = z.object({
  month: z.string().refine(isMonthKey, "month must be YYYY-MM").optional(),
});

/** The month asked for, or the latest complete one; null when not offered. */
export function resolveCommunityMonth(asked: string | undefined, now: Date): string | null {
  const month = asked ?? latestCompleteMonth(now);
  return availableMonths(now).includes(month) ? month : null;
}

export async function communityRoutes(app: FastifyInstance) {
  // GET /community/monthly?month=YYYY-MM  (default: the latest complete month)
  // Response { data: CommunityMonthly }. 404 for a month not offered (not
  // finished yet, or before March 2026).
  app.get(
    "/monthly",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const q = querySchema.safeParse(request.query);
      if (!q.success) return reply.status(400).send({ error: q.error.issues[0]?.message ?? "Invalid query" });
      const month = resolveCommunityMonth(q.data.month, new Date());
      if (!month) return reply.status(404).send({ error: "No community numbers for that month" });
      const data = await getCommunityMonthly(month);
      reply.header("Cache-Control", "public, max-age=3600");
      return reply.send({ data });
    },
  );
}
