import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { inclusiveDayCount, loadOdometerTimelines } from "../../services/odometer.js";
import { odometerDays } from "@mileclear/shared";
import type { OdometerDayWithVehicle } from "@mileclear/shared";

const MAX_DAYS = 366;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like 2026-10-09.");

const daysQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  from: dateOnly,
  to: dateOnly,
});

export async function odometerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  /**
   * One object per Europe/London day on which a vehicle had a completed trip
   * or an accepted real reading, newest first. With `vehicleId` it is that
   * vehicle; without it, every vehicle of the driver (each object carries its
   * vehicleId, so a date can appear once per vehicle). Figures are worked out
   * from all of a vehicle's trips whatever range is asked for.
   */
  app.get("/days", async (request, reply) => {
    const parsed = daysQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { vehicleId, from, to } = parsed.data;
    if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) {
      return reply.status(400).send({ error: "Pick a start date that is before the end date." });
    }
    if (inclusiveDayCount(from, to) > MAX_DAYS) {
      return reply.status(400).send({ error: `Pick a range of ${MAX_DAYS} days or fewer.` });
    }

    const userId = request.userId!;
    let vehicleIds: string[];
    if (vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, userId }, select: { id: true } });
      if (!vehicle) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
      vehicleIds = [vehicle.id];
    } else {
      const vehicles = await prisma.vehicle.findMany({ where: { userId }, select: { id: true }, take: 50 });
      vehicleIds = vehicles.map((v) => v.id);
    }
    if (vehicleIds.length === 0) {
      return reply.send({ data: [] as OdometerDayWithVehicle[] });
    }

    const timelines = await loadOdometerTimelines(userId, vehicleIds);
    const data: OdometerDayWithVehicle[] = [];
    for (const [id, tl] of timelines) {
      for (const day of odometerDays(tl, from, to)) data.push({ ...day, vehicleId: id });
    }
    data.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
    return reply.send({ data });
  });
}

