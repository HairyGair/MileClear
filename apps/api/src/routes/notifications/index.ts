import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { OPT_IN_PUSH_PREF_KEYS, PUSH_PREF_KEYS } from "../../services/pushPrefs.js";

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

const prefsSchema = z
  .object(
    Object.fromEntries(PUSH_PREF_KEYS.map((k) => [k, z.boolean().optional()]))
  )
  .strict();

export async function notificationRoutes(app: FastifyInstance) {
  // PUT /notifications/preferences — sync the mobile notification
  // preference toggles so SERVER-sent pushes can honour them (they were
  // client-side only before 8 Jul 2026; see services/pushPrefs.ts).
  app.put(
    "/preferences",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const parsed = prefsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      // The app sends its whole set of switches. An app from before 2 Oct 2026
      // does not know the opt-in keys, so a save from it must not switch off
      // an opt-in the driver (or the 2 Oct carry-over) turned on: keep any
      // opt-in key the body leaves out.
      const existing = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { pushPrefs: true },
      });
      const stored =
        existing?.pushPrefs && typeof existing.pushPrefs === "object" && !Array.isArray(existing.pushPrefs)
          ? (existing.pushPrefs as Record<string, unknown>)
          : {};
      const next: Record<string, boolean> = {};
      for (const k of OPT_IN_PUSH_PREF_KEYS) {
        if (typeof stored[k] === "boolean") next[k] = stored[k] as boolean;
      }
      for (const [k, v] of Object.entries(parsed.data)) {
        if (typeof v === "boolean") next[k] = v;
      }
      await prisma.user.update({
        where: { id: request.userId! },
        data: { pushPrefs: next },
      });
      return reply.send({ data: { ok: true } });
    }
  );

  // GET /notifications/preferences — the switches the server holds, so the
  // app can pick up an opt-in set on the server (the 2 Oct 2026 fuel-alert
  // carry-over) instead of showing it off and saving it off.
  app.get(
    "/preferences",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { pushPrefs: true },
      });
      const prefs =
        user?.pushPrefs && typeof user.pushPrefs === "object" && !Array.isArray(user.pushPrefs)
          ? (user.pushPrefs as Record<string, unknown>)
          : {};
      return reply.send({ data: prefs });
    }
  );

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
