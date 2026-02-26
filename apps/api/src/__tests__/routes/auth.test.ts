/**
 * Auth route tests — uses Fastify's app.inject() so no real HTTP server is
 * started and no database connection is made.  Prisma is mocked below.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken, makeExpiredAccessToken, makeRefreshToken } from "../helpers/tokens.js";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
// vi.mock is hoisted to the top of the compiled output by Vite, so the mock
// is in place before any route file imports ../../lib/prisma.js
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    verificationCode: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock services that have side effects (email, bcrypt is real but slow — keep
// bcrypt real so password-checking logic is genuinely exercised)
// ---------------------------------------------------------------------------
vi.mock("../../services/email.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Lazy imports (after vi.mock declarations)
// ---------------------------------------------------------------------------
import { authRoutes } from "../../routes/auth/index.js";
import { prisma } from "../../lib/prisma.js";

// Typed mock helpers
const mockUser = prisma.user as ReturnType<typeof vi.fn> & typeof prisma.user;
const mockRefreshToken = prisma.refreshToken as ReturnType<typeof vi.fn> & typeof prisma.refreshToken;

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

const TEST_USER = {
  id: TEST_USER_ID,
  email: "test@example.com",
  passwordHash: null as string | null, // set per-test after hashing
  displayName: "Test User",
  emailVerified: false,
  isAdmin: false,
  termsAcceptedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  appleId: null,
  googleId: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  premiumUntil: null,
  isPremium: false,
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

async function createTestApp() {
  const app = await buildApp();
  await app.register(authRoutes, { prefix: "/auth" });
  return app;
}

function resetMocks() {
  vi.clearAllMocks();

  // Default: all Prisma calls return null (not found)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.create).mockResolvedValue(TEST_USER as any);
  vi.mocked(prisma.refreshToken.create).mockResolvedValue({
    id: "rt-1",
    userId: TEST_USER_ID,
    token: "some-token",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  } as any);
  vi.mocked(prisma.verificationCode.create).mockResolvedValue({} as any);
  vi.mocked(prisma.$transaction).mockImplementation(async (ops: any) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    return ops({ ...prisma });
  });
}

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

describe("POST /auth/register", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("201 — registers a new user and returns tokens", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "secure-password-123",
        displayName: "New User",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(typeof body.data.accessToken).toBe("string");
    expect(typeof body.data.refreshToken).toBe("string");
    // Tokens should be non-empty JWTs (3 dot-separated parts)
    expect(body.data.accessToken.split(".").length).toBe(3);
    expect(body.data.refreshToken.split(".").length).toBe(3);
  });

  it("400 — rejects invalid email format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "not-an-email",
        password: "secure-password-123",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/email/i);
  });

  it("400 — rejects password shorter than 8 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "user@example.com",
        password: "short",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/8 characters/i);
  });

  it("400 — rejects duplicate email with generic message (no account enumeration)", async () => {
    // Simulate an existing user
    vi.mocked(prisma.user.findUnique).mockResolvedValue(TEST_USER as any);

    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "test@example.com",
        password: "secure-password-123",
      },
    });

    expect(res.statusCode).toBe(400);
    // The message must NOT say "already exists" — it should be deliberately vague
    const msg: string = res.json().error;
    expect(msg).not.toMatch(/already exists/i);
    expect(msg.length).toBeGreaterThan(0);
  });

  it("400 — rejects missing password field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "user@example.com" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("400 — rejects missing email field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { password: "secure-password-123" },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

describe("POST /auth/login", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  // We need a real bcrypt hash for the password tests.  Pre-computed at 12
  // rounds for "correct-password" — but that is very slow in tests.  Use 1
  // round via bcryptjs directly.
  let passwordHash: string;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();

    // Generate a cheap hash (1 round) for test speed
    const bcrypt = await import("bcryptjs");
    passwordHash = await bcrypt.hash("correct-password", 1);
  });

  it("200 — returns tokens for valid credentials", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...TEST_USER,
      passwordHash,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "test@example.com", password: "correct-password" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
  });

  it("401 — rejects wrong password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...TEST_USER,
      passwordHash,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "test@example.com", password: "wrong-password" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid email or password/i);
  });

  it("401 — rejects unknown email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "whatever" },
    });

    expect(res.statusCode).toBe(401);
    // Same generic message — no user existence leak
    expect(res.json().error).toMatch(/invalid email or password/i);
  });

  it("400 — rejects invalid email in login payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "bad-email", password: "password123" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("400 — rejects missing password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "test@example.com" },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

describe("POST /auth/refresh", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("200 — issues new token pair for a valid refresh token", async () => {
    const validToken = makeRefreshToken(TEST_USER_ID);
    const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "rt-1",
      userId: TEST_USER_ID,
      token: validToken,
      expiresAt: futureExpiry,
      createdAt: new Date(),
    } as any);

    vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({ count: 1 } as any);

    // isAdmin lookup
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isAdmin: false,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: validToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    // Rotated — old token deleted, new one stored
    expect(vi.mocked(prisma.refreshToken.deleteMany)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.refreshToken.create)).toHaveBeenCalledTimes(1);
  });

  it("401 — rejects an unknown refresh token", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "unknown-token-value" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid or expired/i);
  });

  it("401 — rejects an expired refresh token stored in DB", async () => {
    const pastExpiry = new Date(Date.now() - 1000); // already expired

    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "rt-2",
      userId: TEST_USER_ID,
      token: "expired-token",
      expiresAt: pastExpiry,
      createdAt: new Date(),
    } as any);

    vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "expired-token" },
    });

    expect(res.statusCode).toBe(401);
    // Expired token should be cleaned up from DB
    expect(vi.mocked(prisma.refreshToken.deleteMany)).toHaveBeenCalledTimes(1);
  });

  it("400 — rejects missing refreshToken field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Auth middleware rejection
// ---------------------------------------------------------------------------

describe("Auth middleware", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();

    // Add a trivial protected route for testing the middleware directly
    app.get(
      "/protected",
      {
        preHandler: [
          async (req, reply) => {
            const { authMiddleware } = await import(
              "../../middleware/auth.js"
            );
            return authMiddleware(req, reply);
          },
        ],
      },
      async () => ({ ok: true })
    );
  });

  it("401 — rejects request with no Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/missing or invalid token/i);
  });

  it("401 — rejects request with a malformed token (not a JWT)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer this-is-not-a-jwt" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid or expired/i);
  });

  it("401 — rejects an expired access token", async () => {
    const expired = makeExpiredAccessToken(TEST_USER_ID);
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("200 — accepts a valid access token", async () => {
    const token = makeAccessToken(TEST_USER_ID);
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});
