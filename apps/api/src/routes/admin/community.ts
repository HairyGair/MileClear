import { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminCommunityMonthly } from "@mileclear/shared";
import { buildCommunityPosts, isMonthKey } from "../../services/communityMonthly.js";
import { getCommunityMonthly } from "../../services/communityMonthlyLoader.js";
import { resolveCommunityMonth } from "../community/index.js";

// Registered inside adminRoutes, so auth + admin hooks already apply.
export async function adminCommunityRoutes(app: FastifyInstance): Promise<void> {
  // GET /admin/community/monthly?month=YYYY-MM
  // Response { data: AdminCommunityMonthly }: the public numbers plus two or
  // three ready-to-paste social posts (empty when the month is unpublished).
  app.get("/community/monthly", async (request, reply) => {
    const q = z
      .object({ month: z.string().refine(isMonthKey, "month must be YYYY-MM").optional() })
      .safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: q.error.issues[0]?.message ?? "Invalid query" });
    const month = resolveCommunityMonth(q.data.month, new Date());
    if (!month) return reply.status(404).send({ error: "No community numbers for that month" });
    const numbers = await getCommunityMonthly(month);
    const data: AdminCommunityMonthly = { ...numbers, posts: buildCommunityPosts(numbers) };
    return reply.send({ data });
  });
}
