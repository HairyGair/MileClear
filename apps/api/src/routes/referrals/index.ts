import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { attachReferral, getReferralSummary } from "../../services/referral.js";

const applySchema = z.object({
  code: z.string().min(1).max(16),
});

export async function referralRoutes(app: FastifyInstance) {
  // GET /referrals — the invite screen payload: code, share URL, progress.
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const summary = await getReferralSummary(request.userId!);
    return reply.send({ data: summary });
  });

  // POST /referrals/apply — catch-up path for users who installed first and
  // entered a code later (within APPLY_WINDOW_DAYS of signup). Registration
  // attributes inline; this covers everyone who missed that.
  app.post("/apply", { preHandler: authMiddleware }, async (request, reply) => {
    const parsed = applySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "A referral code is required" });
    }
    const result = await attachReferral(request.userId!, parsed.data.code, {
      enforceWindow: true,
    });
    if (!result.ok) {
      const message =
        result.reason === "self_referral"
          ? "You can't use your own referral code."
          : result.reason === "already_referred"
            ? "You've already used a referral code."
            : result.reason === "window_closed"
              ? "Referral codes can only be added in your first week."
              : "That referral code isn't valid.";
      return reply.status(400).send({ error: message, reason: result.reason });
    }
    return reply.send({ data: { ok: true } });
  });
}
