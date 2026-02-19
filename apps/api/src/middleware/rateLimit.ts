// Rate limiting is configured via @fastify/rate-limit plugin.
// This file provides helpers for custom rate limit rules.

import { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
}
