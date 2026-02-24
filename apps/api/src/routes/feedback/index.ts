import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";

const submitSchema = z.object({
  displayName: z.string().max(100).optional(),
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(2000),
  category: z.enum(["feature_request", "bug_report", "improvement", "other"]).default("feature_request"),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  category: z.enum(["feature_request", "bug_report", "improvement", "other"]).optional(),
  status: z.enum(["new", "planned", "in_progress", "done", "declined"]).optional(),
  sort: z.enum(["newest", "most_voted"]).default("most_voted"),
});

const statusUpdateSchema = z.object({
  status: z.enum(["new", "planned", "in_progress", "done", "declined"]),
});

async function optionalAuth(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return;
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
      algorithms: ["HS256"],
    }) as { userId: string; isAdmin?: boolean };
    request.userId = decoded.userId;
    request.isAdmin = decoded.isAdmin ?? false;
  } catch {
    /* proceed as anonymous */
  }
}

export async function feedbackRoutes(app: FastifyInstance) {
  // POST /feedback — submit (anonymous or authenticated)
  app.post("/", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    handler: async (request, reply) => {
      await optionalAuth(request);

      const parsed = submitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      }

      const { displayName, title, body, category } = parsed.data;

      const feedback = await prisma.feedback.create({
        data: {
          userId: request.userId ?? null,
          displayName: displayName || null,
          title,
          body,
          category,
        },
      });

      return reply.status(201).send({ data: feedback, message: "Feedback submitted!" });
    },
  });

  // GET /feedback — list (optional auth for hasVoted)
  app.get("/", async (request, reply) => {
    await optionalAuth(request);

    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query parameters" });
    }

    const { page, pageSize, category, status, sort } = parsed.data;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (status) where.status = status;

    const orderBy =
      sort === "newest"
        ? { createdAt: "desc" as const }
        : { upvoteCount: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          userId: true,
          displayName: true,
          title: true,
          body: true,
          category: true,
          status: true,
          upvoteCount: true,
          createdAt: true,
        },
      }),
      prisma.feedback.count({ where }),
    ]);

    let votedSet = new Set<string>();
    if (request.userId && items.length > 0) {
      const votes = await prisma.feedbackVote.findMany({
        where: {
          userId: request.userId,
          feedbackId: { in: items.map((i) => i.id) },
        },
        select: { feedbackId: true },
      });
      votedSet = new Set(votes.map((v) => v.feedbackId));
    }

    const data = items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      hasVoted: votedSet.has(item.id),
    }));

    return reply.send({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // POST /feedback/:id/vote — toggle upvote (auth required)
  app.post("/:id/vote", { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;

    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      return reply.status(404).send({ error: "Feedback not found" });
    }

    const existingVote = await prisma.feedbackVote.findUnique({
      where: { feedbackId_userId: { feedbackId: id, userId } },
    });

    if (existingVote) {
      await prisma.$transaction([
        prisma.feedbackVote.delete({
          where: { id: existingVote.id },
        }),
        prisma.feedback.update({
          where: { id },
          data: { upvoteCount: { decrement: 1 } },
        }),
      ]);
      return reply.send({ data: { voted: false }, message: "Vote removed" });
    } else {
      await prisma.$transaction([
        prisma.feedbackVote.create({
          data: { feedbackId: id, userId },
        }),
        prisma.feedback.update({
          where: { id },
          data: { upvoteCount: { increment: 1 } },
        }),
      ]);
      return reply.send({ data: { voted: true }, message: "Voted!" });
    }
  });

  // GET /feedback/stats — admin only
  app.get("/stats", { preHandler: [authMiddleware, adminMiddleware] }, async (_request, reply) => {
    const [byStatus, byCategory, total] = await Promise.all([
      prisma.feedback.groupBy({ by: ["status"], _count: true }),
      prisma.feedback.groupBy({ by: ["category"], _count: true }),
      prisma.feedback.count(),
    ]);

    return reply.send({
      data: {
        total,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
        byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c._count])),
      },
    });
  });

  // PATCH /feedback/:id/status — admin only
  app.patch("/:id/status", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = statusUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid status" });
    }

    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      return reply.status(404).send({ error: "Feedback not found" });
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    return reply.send({ data: updated, message: "Status updated" });
  });

  // DELETE /feedback/:id — admin only
  app.delete("/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      return reply.status(404).send({ error: "Feedback not found" });
    }

    await prisma.feedback.delete({ where: { id } });

    return reply.send({ message: "Feedback deleted" });
  });
}
