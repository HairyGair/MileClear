import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { roadAlertsForUser } from "../../services/roadAlerts.js";
import { handleSnsBody } from "../../services/streetManager.js";

// Road alerts trial (2 Oct 2026). See services/roadAlerts.ts.
export async function roadAlertRoutes(app: FastifyInstance) {
  // GET /road-alerts: the driver's own Road alerts screen and dashboard card.
  // Serious events on their usual roads now, plus planned closures and
  // roadworks in the next 7 days. Not opted in: only whether to offer it.
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const data = await roadAlertsForUser(request.userId!);
    return reply.send({ data });
  });

  // POST /road-alerts/street-manager/sns: DfT Street Manager open data over
  // AWS SNS. No auth (SNS signature verified instead), no rate limit (SNS
  // posts every permit in England, in bursts, from a few AWS addresses).
  // 404 until STREET_MANAGER_SNS_ENABLED=1. SNS sends text/plain, so this
  // child scope reads every body as raw text for the signature check.
  await app.register(async (sns) => {
    sns.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => done(null, body));
    sns.post(
      "/street-manager/sns",
      { config: { rateLimit: false }, bodyLimit: 1024 * 1024 },
      async (request, reply) => {
        const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? "");
        const res = await handleSnsBody(raw);
        if (res.status >= 400 && res.status !== 404) {
          request.log.warn({ outcome: res.outcome }, "street manager sns rejected");
        }
        return reply.status(res.status).send({ ok: res.status < 400, outcome: res.outcome });
      }
    );
  });
}
