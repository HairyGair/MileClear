import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../../lib/prisma.js";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
} from "../../services/auth.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../../services/email.js";
import { authMiddleware } from "../../middleware/auth.js";
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

const verifySchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  code: z.string().length(6, "Code must be 6 digits"),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
});

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function otpExpiry(): Date {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

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

    // Send verification email (fire-and-forget)
    const code = generateOtp();
    prisma.verificationCode
      .create({ data: { userId: user.id, code, expiresAt: otpExpiry() } })
      .then(() => sendVerificationEmail(email, code))
      .catch((err) => console.error("Failed to send verification email:", err));

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

  // POST /send-verification (authenticated)
  app.post(
    "/send-verification",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = request.userId!;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      if (user.emailVerified) {
        return reply.status(400).send({ error: "Email is already verified" });
      }

      // Invalidate existing unused codes
      await prisma.verificationCode.updateMany({
        where: { userId, used: false },
        data: { used: true },
      });

      const code = generateOtp();
      await prisma.verificationCode.create({
        data: { userId, code, expiresAt: otpExpiry() },
      });

      await sendVerificationEmail(user.email, code);

      return reply.status(200).send({ message: "Verification code sent" });
    }
  );

  // POST /verify (authenticated)
  app.post(
    "/verify",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const parsed = verifySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.errors[0].message });
      }

      const userId = request.userId!;
      const { code } = parsed.data;

      const record = await prisma.verificationCode.findFirst({
        where: {
          userId,
          code,
          used: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!record) {
        return reply.status(400).send({ error: "Invalid or expired verification code" });
      }

      await prisma.$transaction([
        prisma.verificationCode.update({
          where: { id: record.id },
          data: { used: true },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { emailVerified: true },
        }),
      ]);

      return reply.status(200).send({ message: "Email verified" });
    }
  );

  // POST /forgot-password (public)
  app.post("/forgot-password", async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const { email } = parsed.data;

    // Always return success to avoid leaking user existence
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // Invalidate existing unused codes
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      const code = generateOtp();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, code, expiresAt: otpExpiry() },
      });

      await sendPasswordResetEmail(email, code);
    }

    return reply.status(200).send({
      message: "If an account exists with that email, a reset code has been sent",
    });
  });

  // POST /reset-password (public)
  app.post("/reset-password", async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const { email, code, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(400).send({ error: "Invalid or expired reset code" });
    }

    const record = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      return reply.status(400).send({ error: "Invalid or expired reset code" });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      // Invalidate all refresh tokens (log out all sessions)
      prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    return reply.status(200).send({ message: "Password reset successfully" });
  });

  app.post("/apple", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/google", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
