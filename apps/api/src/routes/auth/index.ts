import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
} from "../../services/auth.js";
import { REFRESH_TOKEN_EXPIRY_DAYS } from "@mileclear/shared";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  displayName: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

function storeRefreshToken(userId: string, token: string) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });
}

export async function authRoutes(app: FastifyInstance) {
  // POST /register
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const { email, password, displayName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
    });

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);

    return reply.status(201).send({
      data: { accessToken, refreshToken },
    });
  });

  // POST /login
  app.post(
    "/login",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.errors[0].message });
      }

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const accessToken = generateAccessToken(user.id);
      const refreshToken = generateRefreshToken(user.id);
      await storeRefreshToken(user.id, refreshToken);

      return reply.status(200).send({
        data: { accessToken, refreshToken },
      });
    }
  );

  // POST /refresh
  app.post("/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const { refreshToken } = parsed.data;

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.expiresAt < new Date()) {
      // Clean up expired token if it exists
      if (stored) {
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      return reply.status(401).send({ error: "Invalid or expired refresh token" });
    }

    // Token rotation: delete old, issue new
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const newAccessToken = generateAccessToken(stored.userId);
    const newRefreshToken = generateRefreshToken(stored.userId);
    await storeRefreshToken(stored.userId, newRefreshToken);

    return reply.status(200).send({
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  });

  // POST /logout
  app.post("/logout", async (request, reply) => {
    const parsed = logoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const { refreshToken } = parsed.data;

    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });

    return reply.status(200).send({ message: "Logged out" });
  });

  // Stubs for post-MVP
  app.post("/verify", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/forgot-password", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/reset-password", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/apple", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/google", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
