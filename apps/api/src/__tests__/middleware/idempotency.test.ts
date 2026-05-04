/**
 * Idempotency middleware tests.
 *
 * Covers: no-header passthrough, cache miss + write, cache hit replay,
 * expired key cleanup, invalid header rejection, non-mutation methods
 * untouched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    idempotencyKey: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    appEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { attachIdempotency } from "../../middleware/idempotency.js";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-000000000099";

async function createTestApp() {
  const app = await buildApp();
  app.addHook("preHandler", authMiddleware);
  attachIdempotency(app);

  // A simple counter route to verify the handler runs (or doesn't) on
  // each request. The counter increments every time the handler executes.
  let counter = 0;
  app.post("/counter", async () => {
    counter += 1;
    return { count: counter, message: "incremented" };
  });
  app.get("/counter", async () => ({ count: counter }));

  return { app, getCount: () => counter };
}

const validAuthHeader = () => ({
  authorization: `Bearer ${makeAccessToken(USER_ID)}`,
});

const VALID_KEY = "test-key-12345678";

describe("idempotency middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue(null);
  });

  it("passes through when no Idempotency-Key header present", async () => {
    const { app, getCount } = await createTestApp();

    const r1 = await app.inject({ method: "POST", url: "/counter", headers: validAuthHeader() });
    const r2 = await app.inject({ method: "POST", url: "/counter", headers: validAuthHeader() });

    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    // Handler ran twice
    expect(getCount()).toBe(2);
    // No DB lookup or write happened
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it("rejects malformed Idempotency-Key with 400", async () => {
    const { app } = await createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/counter",
      headers: { ...validAuthHeader(), "idempotency-key": "x" }, // too short
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Idempotency-Key/);
  });

  it("on cache miss: runs handler and writes the response", async () => {
    const { app, getCount } = await createTestApp();
    vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/counter",
      headers: { ...validAuthHeader(), "idempotency-key": VALID_KEY },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 1, message: "incremented" });
    expect(getCount()).toBe(1);

    // Cache write happens fire-and-forget; flush microtasks
    await new Promise((r) => setTimeout(r, 50));

    expect(prisma.idempotencyKey.create).toHaveBeenCalled();
    const call = vi.mocked(prisma.idempotencyKey.create).mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
    expect(call?.data?.userId).toBe(USER_ID);
    expect(call?.data?.key).toBe(VALID_KEY);
    expect(call?.data?.method).toBe("POST");
    expect(call?.data?.statusCode).toBe(200);
    expect(typeof call?.data?.responseBody).toBe("string");
  });

  it("on cache hit: replays the cached response WITHOUT running the handler", async () => {
    const { app, getCount } = await createTestApp();
    const futureExpiry = new Date(Date.now() + 60_000);
    vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue({
      id: "row-1",
      userId: USER_ID,
      key: VALID_KEY,
      method: "POST",
      path: "/counter",
      statusCode: 201,
      responseBody: JSON.stringify({ count: 42, message: "from cache" }),
      createdAt: new Date(),
      expiresAt: futureExpiry,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/counter",
      headers: { ...validAuthHeader(), "idempotency-key": VALID_KEY },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ count: 42, message: "from cache" });
    // Handler did NOT run — counter unchanged
    expect(getCount()).toBe(0);
  });

  it("on expired cache hit: deletes stale row and re-runs the handler", async () => {
    const { app, getCount } = await createTestApp();
    const pastExpiry = new Date(Date.now() - 60_000);
    vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue({
      id: "row-stale",
      userId: USER_ID,
      key: VALID_KEY,
      method: "POST",
      path: "/counter",
      statusCode: 200,
      responseBody: JSON.stringify({ count: 99 }),
      createdAt: new Date(),
      expiresAt: pastExpiry,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/counter",
      headers: { ...validAuthHeader(), "idempotency-key": VALID_KEY },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 1, message: "incremented" });
    expect(getCount()).toBe(1);
    expect(prisma.idempotencyKey.delete).toHaveBeenCalledWith({
      where: { id: "row-stale" },
    });
  });

  it("does not interfere with GET requests even with the header set", async () => {
    const { app } = await createTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/counter",
      headers: { ...validAuthHeader(), "idempotency-key": VALID_KEY },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it("does not cache 4xx responses", async () => {
    const errorApp = await buildApp();
    errorApp.addHook("preHandler", authMiddleware);
    attachIdempotency(errorApp);
    errorApp.post("/error-route", async (_req, reply) => {
      return reply.status(400).send({ error: "bad request" });
    });

    const res = await errorApp.inject({
      method: "POST",
      url: "/error-route",
      headers: { ...validAuthHeader(), "idempotency-key": VALID_KEY },
    });

    expect(res.statusCode).toBe(400);
    await new Promise((r) => setImmediate(r));
    // No cache write because the response was an error
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });
});
