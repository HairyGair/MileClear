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
    logger: false, // keep test output clean
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);

  return app;
}
