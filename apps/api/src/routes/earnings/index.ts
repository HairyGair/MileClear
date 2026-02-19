import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  PLATFORM_TAGS,
  EARNING_SOURCES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@mileclear/shared";

const createEarningSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  amountPence: z.number().int().positive("Amount must be positive"),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

const updateEarningSchema = z.object({
  platform: z.string().min(1).optional(),
  amountPence: z.number().int().positive().optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
});

const listEarningsQuery = z.object({
  platform: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export async function earningRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Create earning (manual entry)
  app.post("/", async (request, reply) => {
    const parsed = createEarningSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { platform, amountPence, periodStart, periodEnd } = parsed.data;
    const userId = request.userId!;

    if (periodEnd < periodStart) {
      return reply.status(400).send({ error: "Period end must be on or after period start" });
    }

    const earning = await prisma.earning.create({
      data: {
        userId,
        platform,
        amountPence,
        periodStart,
        periodEnd,
        source: "manual",
      },
    });

    return reply.status(201).send({ data: earning });
  });

  // List earnings with pagination
  app.get("/", async (request, reply) => {
    const parsed = listEarningsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { platform, from, to, page, pageSize } = parsed.data;
    const userId = request.userId!;

    const where: Record<string, unknown> = { userId };
    if (platform) where.platform = platform;
    if (from) where.periodStart = { ...(where.periodStart as object), gte: from };
    if (to) where.periodEnd = { ...(where.periodEnd as object), lte: to };

    const [data, total] = await Promise.all([
      prisma.earning.findMany({
        where,
        orderBy: { periodStart: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.earning.count({ where }),
    ]);

    return reply.send({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // Update earning
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateEarningSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const updates = parsed.data;

    const existing = await prisma.earning.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Earning not found" });
    }

    // Validate date range with merged values
    const newStart = updates.periodStart ?? existing.periodStart;
    const newEnd = updates.periodEnd ?? existing.periodEnd;
    if (newEnd < newStart) {
      return reply.status(400).send({ error: "Period end must be on or after period start" });
    }

    const earning = await prisma.earning.update({
      where: { id },
      data: updates,
    });

    return reply.send({ data: earning });
  });

  // Delete earning
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;

    const existing = await prisma.earning.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Earning not found" });
    }

    await prisma.earning.delete({ where: { id } });

    return reply.send({ message: "Earning deleted" });
  });

  // Future stubs
  app.post("/csv", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/ocr", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/open-banking", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/open-banking", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
