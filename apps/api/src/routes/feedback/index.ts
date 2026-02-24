import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
}

const idParamSchema = z.object({
  id: z.string().uuid(),
});

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

export async function feedbackRoutes(app: FastifyInstance) {
  // POST /feedback — submit (anonymous or authenticated)
  app.post("/", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    preHandler: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const parsed = submitSchema.safeParse(request.body);
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        const fields: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(fieldErrors)) {
          fields[key] = Array.isArray(msgs) && msgs.length > 0 ? msgs[0] : "Invalid value";
        }
        return reply.status(400).send({ error: "Invalid input", fields });
      }

      const { displayName, title, body, category } = parsed.data;

      const feedback = await prisma.feedback.create({
        data: {
          userId: request.userId ?? null,
          displayName: displayName ? sanitizeText(displayName) : null,
          title: sanitizeText(title),
          body: sanitizeText(body),
          category,
        },
        select: {
          id: true,
          displayName: true,
          title: true,
          body: true,
          category: true,
          status: true,
          upvoteCount: true,
          createdAt: true,
        },
      });

      return reply.status(201).send({
        data: {
          ...feedback,
          createdAt: feedback.createdAt.toISOString(),
          hasVoted: false,
        },
        message: "Feedback submitted!",
      });
    },
  });

  // GET /feedback/stats — admin only (registered BEFORE parametric routes)
  app.get("/stats", { preHandler: [authMiddleware, adminMiddleware] }, async (_request, reply) => {
    const [byStatus, byCategory, total] = await Promise.all([
      prisma.feedback.groupBy({ by: ["status"], _count: true }),
      prisma.feedback.groupBy({ by: ["category"], _count: true }),
      prisma.feedback.count(),
    ]);

    return reply.send({
      data: {
        total,
        byStatus: Object.fromEntries(byStatus.map((s: { status: string; _count: number }) => [s.status, s._count])),
        byCategory: Object.fromEntries(byCategory.map((c: { category: string; _count: number }) => [c.category, c._count])),
      },
    });
  });

  // POST /feedback/reconcile — admin: recalculate all upvoteCounts from actual votes
  app.post("/reconcile", { preHandler: [authMiddleware, adminMiddleware] }, async (_request, reply) => {
    const voteCounts = await prisma.feedbackVote.groupBy({
      by: ["feedbackId"],
      _count: true,
    });

    const countMap = new Map(voteCounts.map((v: { feedbackId: string; _count: number }) => [v.feedbackId, v._count]));

    const allFeedback = await prisma.feedback.findMany({ select: { id: true, upvoteCount: true } });

    let fixed = 0;
    for (const fb of allFeedback) {
      const actual = countMap.get(fb.id) ?? 0;
      if (fb.upvoteCount !== actual) {
        await prisma.feedback.update({ where: { id: fb.id }, data: { upvoteCount: actual } });
        fixed++;
      }
    }

    return reply.send({ data: { checked: allFeedback.length, fixed }, message: "Reconciliation complete" });
  });

  // GET /feedback — list (optional auth for hasVoted)
  app.get("/", { preHandler: [optionalAuthMiddleware] }, async (request, reply) => {
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
          feedbackId: { in: items.map((i: { id: string }) => i.id) },
        },
        select: { feedbackId: true },
      });
      votedSet = new Set(votes.map((v: { feedbackId: string }) => v.feedbackId));
    }

    const data = items.map((item: { id: string; userId: string | null; displayName: string | null; title: string; body: string; category: string; status: string; upvoteCount: number; createdAt: Date }) => ({
      id: item.id,
      displayName: item.displayName,
      title: item.title,
      body: item.body,
      category: item.category,
      status: item.status,
      upvoteCount: item.upvoteCount,
      createdAt: item.createdAt.toISOString(),
      hasVoted: votedSet.has(item.id),
      isOwner: request.userId ? item.userId === request.userId : false,
    }));

    return reply.send({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // POST /feedback/:id/vote — toggle upvote (auth required, rate limited)
  app.post("/:id/vote", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const paramsParsed = idParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: "Invalid feedback ID" });
    }
    const { id } = paramsParsed.data;
    const userId = request.userId!;

    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      return reply.status(404).send({ error: "Feedback not found" });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingVote = await tx.feedbackVote.findUnique({
          where: { feedbackId_userId: { feedbackId: id, userId } },
        });

        if (existingVote) {
          await tx.feedbackVote.delete({ where: { id: existingVote.id } });
          await tx.feedback.update({
            where: { id },
            data: { upvoteCount: { decrement: 1 } },
          });
          return { voted: false };
        } else {
          await tx.feedbackVote.create({ data: { feedbackId: id, userId } });
          await tx.feedback.update({
            where: { id },
            data: { upvoteCount: { increment: 1 } },
          });
          return { voted: true };
        }
      });

      return reply.send({
        data: result,
        message: result.voted ? "Voted!" : "Vote removed",
      });
    } catch (e: unknown) {
      const prismaError = e as { code?: string };
      if (prismaError.code === "P2002") {
        return reply.status(409).send({ error: "Vote already recorded" });
      }
      throw e;
    }
  });

  // PATCH /feedback/:id/status — admin only
  app.patch("/:id/status", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    const paramsParsed = idParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: "Invalid feedback ID" });
    }
    const { id } = paramsParsed.data;

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
    const paramsParsed = idParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: "Invalid feedback ID" });
    }
    const { id } = paramsParsed.data;

    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      return reply.status(404).send({ error: "Feedback not found" });
    }

    await prisma.feedback.delete({ where: { id } });

    return reply.send({ message: "Feedback deleted" });
  });
}
