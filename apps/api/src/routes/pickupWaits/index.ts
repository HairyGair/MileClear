import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import type { PickupWait } from "@mileclear/shared";

function toPickupWait(row: {
  id: string;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  platform: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
}): PickupWait {
  return {
    id: row.id,
    locationName: row.locationName,
    locationLat: row.locationLat,
    locationLng: row.locationLng,
    platform: row.platform,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
  };
}

export async function pickupWaitRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // POST /pickup-waits/start — begin a new wait. Returns the new record so
  // the client can stash the id and call /end later.
  app.post("/start", async (request, reply) => {
    const body = z
      .object({
        locationName: z.string().max(255).optional(),
        locationLat: z.number().min(-90).max(90).optional(),
        locationLng: z.number().min(-180).max(180).optional(),
        platform: z.string().min(1).max(40).optional(),
      })
      .parse(request.body);

    // Auto-end any wait that's been open for >2h - assumed forgotten about.
    // Otherwise drivers end up with one bogus 47-hour wait skewing averages.
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.pickupWait.updateMany({
      where: {
        userId: request.userId!,
        endedAt: null,
        startedAt: { lt: cutoff },
      },
      data: {
        endedAt: new Date(),
        durationSeconds: 7200, // capped at the cutoff value
      },
    });

    const row = await prisma.pickupWait.create({
      data: {
        userId: request.userId!,
        locationName: body.locationName ?? null,
        locationLat: body.locationLat ?? null,
        locationLng: body.locationLng ?? null,
        platform: body.platform ?? null,
        startedAt: new Date(),
      },
    });

    return reply.send({ data: toPickupWait(row) });
  });

  // POST /pickup-waits/:id/end — close out a wait. Idempotent.
  app.post(
    "/:id/end",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply
    ) => {
      const { id } = z
        .object({ id: z.string().uuid() })
        .parse(request.params);

      const existing = await prisma.pickupWait.findFirst({
        where: { id, userId: request.userId! },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Wait not found" });
      }

      // Idempotent - if already ended, just return current state.
      if (existing.endedAt) {
        return reply.send({ data: toPickupWait(existing) });
      }

      const now = new Date();
      const durationSeconds = Math.max(
        0,
        Math.round((now.getTime() - existing.startedAt.getTime()) / 1000)
      );

      const row = await prisma.pickupWait.update({
        where: { id },
        data: {
          endedAt: now,
          durationSeconds,
        },
      });

      return reply.send({ data: toPickupWait(row) });
    }
  );

  // GET /pickup-waits/active — returns the user's currently-open wait, if any.
  // Used by the mobile app on launch to restore an in-flight wait timer.
  app.get("/active", async (request, reply) => {
    const row = await prisma.pickupWait.findFirst({
      where: { userId: request.userId!, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    return reply.send({ data: row ? toPickupWait(row) : null });
  });
}
