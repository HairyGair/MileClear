/**
 * Builds a minimal Fastify instance suitable for injection-based tests.
 *
 * Only the routes under test are registered — no server.listen() call is made,
 * which avoids port conflicts and the startup validation that calls process.exit.
 *
 * Prisma is mocked at the module level via vi.mock() in each test file before
 * this helper is imported, so the prisma singleton imported by routes will
 * already be the mocked version by the time the Fastify handlers execute.
 */
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Same as server.ts: accountant tokens are 128 hex chars, over
    // Fastify's default of 100.
    maxParamLength: 200,
    logger: { level: process.env.TEST_LOG === "1" ? "error" : "silent" },
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);

  return app;
}
