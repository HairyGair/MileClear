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
}
