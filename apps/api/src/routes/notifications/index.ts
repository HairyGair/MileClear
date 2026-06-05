import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

const registerTokenSchema = z.object({
  pushToken: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (t) => t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["),
      { message: "Invalid Expo push token format" }
    ),
});

// Push-to-start tokens are hex (APNs device tokens), ~64-160 chars.
const laTokenSchema = z.object({
  token: z
    .string()
    .min(8)
    .max(255)
    .regex(/^[0-9a-fA-F]+$/, { message: "Invalid push-to-start token format" }),
});

export async function notificationRoutes(app: FastifyInstance) {
  // POST /notifications/push-token — register or update push token
  app.post(
    "/push-token",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const parsed = registerTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      const userId = request.userId!;
      const { pushToken } = parsed.data;

      // Clear this token from any OTHER user accounts first. Prevents
      // duplicate pushes when a device has been signed into multiple
      // accounts (each account would otherwise receive its own copy of
      // every notification).
      await prisma.user.updateMany({
        where: { pushToken, id: { not: userId } },
        data: { pushToken: null },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { pushToken },
      });

      return reply.status(200).send({ data: { registered: true } });
    }
  );

  // DELETE /notifications/push-token — deregister push token (call on logout)
  app.delete(
    "/push-token",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = request.userId!;

      await prisma.user.update({
        where: { id: userId },
        data: { pushToken: null },
      });

      return reply.status(200).send({ data: { deregistered: true } });
    }
  );

  // POST /notifications/la-token — register the device's push-to-start token
  // for Live Activities (iOS 17.2+). Lets the server start the Dynamic Island
  // on a background-detected drive via an APNs liveactivity push.
  app.post(
    "/la-token",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const parsed = laTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      const userId = request.userId!;
      const { token } = parsed.data;

      // Same anti-duplicate hygiene as the Expo token: a shared device must
      // not leave a stale token on another account.
      await prisma.user.updateMany({
        where: { liveActivityPushToStartToken: token, id: { not: userId } },
        data: { liveActivityPushToStartToken: null },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { liveActivityPushToStartToken: token, laTokenUpdatedAt: new Date() },
      });

      return reply.status(200).send({ data: { registered: true } });
    }
  );

  // DELETE /notifications/la-token — clear the push-to-start token (logout).
  app.delete(
    "/la-token",
    { preHandler: authMiddleware },
    async (request, reply) => {
      await prisma.user.update({
        where: { id: request.userId! },
        data: { liveActivityPushToStartToken: null, laTokenUpdatedAt: null },
      });

      return reply.status(200).send({ data: { deregistered: true } });
    }
  );
}
