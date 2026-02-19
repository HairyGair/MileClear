import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { SHIFT_STATUSES, getTaxYear } from "@mileclear/shared";
import { upsertMileageSummary } from "../../services/mileage.js";
import { checkAndAwardAchievements, getShiftScorecard } from "../../services/gamification.js";

const startShiftSchema = z.object({
  vehicleId: z.string().uuid().optional(),
});

const endShiftSchema = z.object({
  status: z.literal("completed"),
});

export async function shiftRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Start a new shift
  app.post("/", async (request, reply) => {
    const parsed = startShiftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const { vehicleId } = parsed.data;

    // Verify vehicle ownership if provided
    if (vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, userId },
      });
      if (!vehicle) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
    }

    // Enforce one active shift at a time
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: "active" },
    });
    if (activeShift) {
      return reply.status(400).send({ error: "You already have an active shift" });
    }

    const shift = await prisma.shift.create({
      data: {
        userId,
        vehicleId: vehicleId ?? null,
        startedAt: new Date(),
        status: "active",
      },
      include: { vehicle: true },
    });

    return reply.status(201).send({ data: shift });
  });

  // List shifts
  app.get("/", async (request, reply) => {
    const { status } = request.query as { status?: string };

    const where: { userId: string; status?: string } = {
      userId: request.userId!,
    };

    if (status && SHIFT_STATUSES.includes(status as any)) {
      where.status = status;
    }

    const shifts = await prisma.shift.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: { vehicle: true },
    });

    return reply.send({ data: shifts });
  });

  // Get single shift
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const shift = await prisma.shift.findFirst({
      where: { id, userId: request.userId! },
      include: { vehicle: true },
    });

    if (!shift) {
      return reply.status(404).send({ error: "Shift not found" });
    }

    return reply.send({ data: shift });
  });

  // End a shift
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = endShiftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const shift = await prisma.shift.findFirst({
      where: { id, userId: request.userId! },
    });

    if (!shift) {
      return reply.status(404).send({ error: "Shift not found" });
    }

    if (shift.status === "completed") {
      return reply.status(400).send({ error: "Shift is already completed" });
    }

    const updated = await prisma.shift.update({
      where: { id },
      data: {
        status: "completed",
        endedAt: new Date(),
      },
      include: { vehicle: true },
    });

    // Update mileage summary + check achievements
    const taxYear = getTaxYear(shift.startedAt);
    await upsertMileageSummary(request.userId!, taxYear).catch(() => {});
    await checkAndAwardAchievements(request.userId!).catch(() => {});

    // Generate scorecard for this shift
    const scorecard = await getShiftScorecard(request.userId!, id).catch(
      () => null
    );

    return reply.send({ data: updated, scorecard });
  });
}
