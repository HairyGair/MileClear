import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "../services/appEvents.js";

const TTL_HOURS = 24;
const KEY_HEADER = "idempotency-key";

// Validate the header value: alphanumeric + hyphens, 8-128 chars.
// Stops malicious clients sending huge keys or junk that fills the table.
const KEY_REGEX = /^[a-zA-Z0-9_-]{8,128}$/;

// Mutation methods. GET / HEAD / OPTIONS are idempotent by definition
// and never need this treatment.
const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

declare module "fastify" {
  interface FastifyRequest {
    idempotencyKey?: string;
  }
}

/**
 * Idempotency support. Call directly on a FastifyInstance to attach the
 * preHandler + onSend hooks to that instance's encapsulation scope.
 * Mutating endpoints registered after this call become safe to retry: if
 * the client includes an `Idempotency-Key` header on POST/PATCH/PUT/DELETE,
 * the server caches the response for 24 hours and returns the same
 * response on every retry.
 *
 * Without the header, behaviour is unchanged. The header is opt-in.
 *
 * NOTE: NOT a Fastify plugin (don't `app.register(...)` it). Plugins
 * encapsulate by default, which would hide the hooks from sibling routes.
 * Call `attachIdempotency(app)` directly so the hooks apply at the caller's
 * scope.
 *
 * Audit item #3 (external_audit_may_2.md).
 */
export function attachIdempotency(app: FastifyInstance): void {
  // preHandler — short-circuit on cache hit
  app.addHook("preHandler", async (request, reply) => {
    if (!MUTATION_METHODS.has(request.method)) return;
    const userId = request.userId;
    if (!userId) return;

    const rawKey = request.headers[KEY_HEADER];
    if (!rawKey || typeof rawKey !== "string") return;

    if (!KEY_REGEX.test(rawKey)) {
      return reply.status(400).send({
        error: "Invalid Idempotency-Key. Must be 8-128 alphanumeric chars (with - or _).",
      });
    }

    request.idempotencyKey = rawKey;

    const existing = await prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key: rawKey } },
    });

    if (!existing) return;

    if (existing.expiresAt <= new Date()) {
      // Stale — delete and let the handler run normally.
      await prisma.idempotencyKey
        .delete({ where: { id: existing.id } })
        .catch(() => {});
      return;
    }

    // Cache hit — return the original response.
    logEvent("idempotency.replay", userId, {
      key: rawKey,
      method: request.method,
      path: request.url,
    });
    try {
      reply.status(existing.statusCode).send(JSON.parse(existing.responseBody));
    } catch {
      reply.status(existing.statusCode).send(existing.responseBody);
    }
  });

  // onSend — persist successful responses keyed by Idempotency-Key
  app.addHook("onSend", async (request, reply, payload) => {
    const key = request.idempotencyKey;
    if (!key) return payload;
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    const userId = request.userId;
    if (!userId) return payload;

    // Fastify gives us the serialised payload here. It may be a string
    // (already JSON-stringified by Fastify) or a Buffer.
    const body =
      typeof payload === "string"
        ? payload
        : Buffer.isBuffer(payload)
          ? payload.toString("utf-8")
          : JSON.stringify(payload);

    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

    // Fire-and-forget. Race-on-retry is handled by the unique
    // (userId, key) constraint — a Unique violation means another
    // concurrent request already wrote the cache, which is fine.
    prisma.idempotencyKey
      .create({
        data: {
          userId,
          key,
          method: request.method,
          path: request.url.slice(0, 255),
          statusCode: reply.statusCode,
          responseBody: body,
          expiresAt,
        },
      })
      .catch((err: Error) => {
        if (!err.message?.includes("Unique")) {
          request.log.warn(
            { err: err.message, key },
            "[idempotency] cache write failed"
          );
        }
      });

    return payload;
  });
}

/**
 * Drop-in middleware variant — register on a single route via
 * `preHandler: [authMiddleware, idempotencyMiddleware]` if scoping the
 * full plugin isn't worth it for one endpoint. Note: this only handles
 * the cache-hit short-circuit. The cache write requires the plugin's
 * onSend hook, so for full protection use `idempotencyPlugin`.
 */
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!MUTATION_METHODS.has(request.method)) return;
  const userId = request.userId;
  if (!userId) return;

  const rawKey = request.headers[KEY_HEADER];
  if (!rawKey || typeof rawKey !== "string") return;

  if (!KEY_REGEX.test(rawKey)) {
    reply.status(400).send({
      error: "Invalid Idempotency-Key. Must be 8-128 alphanumeric chars (with - or _).",
    });
    return;
  }

  request.idempotencyKey = rawKey;

  const existing = await prisma.idempotencyKey.findUnique({
    where: { userId_key: { userId, key: rawKey } },
  });
  if (!existing) return;

  if (existing.expiresAt <= new Date()) {
    await prisma.idempotencyKey
      .delete({ where: { id: existing.id } })
      .catch(() => {});
    return;
  }

  logEvent("idempotency.replay", userId, {
    key: rawKey,
    method: request.method,
    path: request.url,
  });
  try {
    reply.status(existing.statusCode).send(JSON.parse(existing.responseBody));
  } catch {
    reply.status(existing.statusCode).send(existing.responseBody);
  }
}
