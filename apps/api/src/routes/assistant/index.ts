import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { ApiError, tooManyRequests, invalidInput } from "../../lib/apiError.js";
import { logEvent } from "../../services/appEvents.js";
import {
  ASKED_EVENT,
  ASSISTANT_MODEL,
  AssistantUpstreamError,
  DAILY_LIMIT,
  MONTHLY_LIMIT,
  getAssistantUsage,
  isAssistantAvailable,
  limitMessage,
  runAssistant,
} from "../../services/assistant.js";

/**
 * Ask MileClear (Pro, Oct 2026).
 *
 *   GET  /assistant/status   { available, dailyLimit, monthlyLimit } (any signed-in driver)
 *   POST /assistant/ask      { question, history? } -> { data: { answer, periods, ... } }
 *
 * Dormant until ANTHROPIC_API_KEY is set: status says unavailable and ask
 * returns 503 before the Pro check, so the app hides the feature for everyone.
 * Stateless: no transcript is stored, and the logged event never holds the
 * question text.
 */

const askSchema = z
  .object({
    question: z.string().trim().min(1, "Type a question first.").max(500, "Keep your question under 500 characters."),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string().max(2000),
        })
      )
      .max(6)
      .optional(),
  })
  .strict();

/** One question at a time per driver, so a double tap cannot double-spend. */
const inFlight = new Set<string>();

async function dormantGuard(request: FastifyRequest, reply: FastifyReply) {
  if (isAssistantAvailable()) return;
  const err = new ApiError("SERVICE_UNAVAILABLE", "EmSee isn't available yet.", { statusCode: 503, retryable: false });
  return reply.status(503).send(err.toBody(request.id));
}

export async function assistantRoutes(app: FastifyInstance) {
  app.get("/status", { preHandler: [authMiddleware] }, async (_request, reply) => {
    return reply.send({ available: isAssistantAvailable(), dailyLimit: DAILY_LIMIT, monthlyLimit: MONTHLY_LIMIT });
  });

  app.post(
    "/ask",
    {
      preHandler: [authMiddleware, dormantGuard, premiumMiddleware],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const userId = request.userId!;
      const parsed = askSchema.safeParse(request.body);
      if (!parsed.success) {
        const err = invalidInput(parsed.error.issues[0].message);
        return reply.status(err.statusCode).send(err.toBody(request.id));
      }

      if (inFlight.has(userId)) {
        const err = tooManyRequests("Still working on your last question. Give it a moment.");
        return reply.status(err.statusCode).send(err.toBody(request.id));
      }

      const usage = await getAssistantUsage(userId);
      if (usage.blocked) {
        const err = tooManyRequests(limitMessage(usage.blocked));
        return reply.status(err.statusCode).send(err.toBody(request.id));
      }

      inFlight.add(userId);
      const started = Date.now();
      try {
        const result = await runAssistant({
          userId,
          question: parsed.data.question,
          history: parsed.data.history,
        });
        logEvent(ASKED_EVENT, userId, {
          model: ASSISTANT_MODEL,
          outcome: result.outcome,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          toolCalls: result.toolCalls,
          iterations: result.iterations,
          latencyMs: Date.now() - started,
          historyTurns: parsed.data.history?.length ?? 0,
        });
        return reply.send({
          data: {
            answer: result.answer,
            periods: result.periods,
            remainingToday: Math.max(0, usage.remainingToday - 1),
            remainingThisMonth: Math.max(0, usage.remainingThisMonth - 1),
          },
        });
      } catch (err) {
        if (err instanceof AssistantUpstreamError) {
          // A different event type, so a failure does not use up the allowance.
          logEvent("assistant.failed", userId, {
            model: ASSISTANT_MODEL,
            outcome: err.kind,
            status: err.status,
            latencyMs: Date.now() - started,
          });
          request.log.warn({ status: err.status, kind: err.kind }, "[assistant] upstream failure");
          const apiErr = new ApiError(
            "SERVICE_UNAVAILABLE",
            err.kind === "timeout"
              ? "That took too long to answer. Please try again."
              : "EmSee is busy right now. Please try again in a minute.",
            { statusCode: 503, retryable: true }
          );
          return reply.status(503).send(apiErr.toBody(request.id));
        }
        throw err;
      } finally {
        inFlight.delete(userId);
      }
    }
  );
}
