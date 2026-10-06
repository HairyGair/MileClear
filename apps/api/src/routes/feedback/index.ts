import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";
import { sendFeedbackAcknowledgement, sendFeedbackReplyNotification, sendFeedbackShippedNotification } from "../../services/email.js";
import { buildBoard, legacyListVisibility } from "../../services/feedbackBoard.js";
import { createAppReport, isPrivateFeedbackCategory } from "../../services/supportReports.js";
import { logEvent } from "../../services/appEvents.js";
import { postFounderAlert } from "../../services/discord.js";
import { sendPushToUser } from "../../lib/push.js";

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    // eslint-disable-next-line no-control-regex -- intentional control-char strip
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

const statusUpdateSchema = z
  .object({
    status: z.enum(["new", "planned", "in_progress", "done", "declined"]).optional(),
    // "You asked, we built": one plain sentence on what was built.
    shippedNote: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => d.status !== undefined || d.shippedNote !== undefined, { message: "Nothing to update" });

const knownIssueSchema = z.object({
  isKnownIssue: z.boolean(),
  knownIssueStatus: z.enum(["investigating", "fix_in_progress", "fixed"]).nullable(),
});

const replySchema = z.object({
  body: z.string().min(1).max(2000),
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

      // Older apps still offer "Bug report". From a signed-in driver it becomes
      // a private conversation in the Inbox (with phone details), not a public
      // post. Anonymous ones are stored but never shown publicly.
      if (request.userId && isPrivateFeedbackCategory(category)) {
        const threadKey = await createAppReport({
          userId: request.userId,
          subject: sanitizeText(title),
          body: sanitizeText(body),
          images: [],
          source: "old_feedback_form",
        });
        return reply.status(201).send({
          data: {
            private: true,
            threadKey,
            // Older apps read these fields after a submit.
            id: threadKey,
            displayName: null,
            title: sanitizeText(title),
            body: sanitizeText(body),
            category,
            status: "new",
            upvoteCount: 0,
            createdAt: new Date().toISOString(),
            hasVoted: false,
            replyCount: 0,
            isKnownIssue: false,
            knownIssueStatus: null,
            replies: [],
          },
          message: "Thanks. This went privately to the MileClear team, and we'll reply to you directly.",
        });
      }

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

      logEvent("feedback.submitted", request.userId ?? null, {
        category,
        title: sanitizeText(title),
      });

      // Tell someone. Until 24 Aug 2026 a submission logged an app event and
      // nothing else - no Discord post, no push - so Jimbo's feature request
      // sat unseen for two hours and was only found because he mentioned it.
      // Feedback is rare (two items ever) and comes from the most engaged
      // users, which is exactly why it should never be discovered by accident.
      void (async () => {
        try {
          const author = request.userId
            ? await prisma.user.findUnique({
                where: { id: request.userId },
                select: { email: true, displayName: true, isPremium: true, _count: { select: { trips: true } } },
              })
            : null;
          const who = author
            ? `${author.displayName || author.email} (${author.isPremium ? "Pro" : "free"}, ${author._count.trips} trips)`
            : "anonymous";
          await postFounderAlert({
            severity: "info",
            title: `New feedback: ${sanitizeText(title)}`,
            detail: `${sanitizeText(body).slice(0, 400)}\n\nfrom ${who} · ${category.replace("_", " ")}`,
            userId: request.userId ?? undefined,
            link: "https://mileclear.com/dashboard/feedback",
          });
          // Push to admins too - the Discord channel is not always watched.
          const admins = await prisma.user.findMany({
            where: { isAdmin: true, pushToken: { not: null } },
            select: { id: true },
          });
          for (const a of admins) {
            await sendPushToUser(
              a.id,
              "New feedback",
              `${sanitizeText(title)} - from ${who}`,
              { action: "open_feedback" },
              // Admin alert, not a driver reminder: goes at any hour.
              { ignoreQuietHours: true }
            ).catch(() => {});
          }
        } catch (err) {
          console.error("[feedback] founder notification failed:", err);
        }
      })();

      // Send acknowledgement email (fire-and-forget) if user is authenticated
      if (request.userId) {
        prisma.user
          .findUnique({ where: { id: request.userId }, select: { email: true, displayName: true } })
          .then((user) => {
            if (user) {
              sendFeedbackAcknowledgement(user.email, user.displayName, sanitizeText(title)).catch(
                (err) => console.error("[feedback] Acknowledgement email failed:", err)
              );
            }
          })
          .catch(() => {});
      }

      return reply.status(201).send({
        data: {
          ...feedback,
          createdAt: feedback.createdAt.toISOString(),
          hasVoted: false,
          replyCount: 0,
          isKnownIssue: false,
          knownIssueStatus: null,
          replies: [],
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

  // GET /feedback/known-issues — public list of known issues
  app.get("/known-issues", { preHandler: [optionalAuthMiddleware] }, async (request, reply) => {
    const items = await prisma.feedback.findMany({
      where: { isKnownIssue: true },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        displayName: true,
        title: true,
        body: true,
        category: true,
        status: true,
        upvoteCount: true,
        isKnownIssue: true,
        knownIssueStatus: true,
        createdAt: true,
        replies: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            user: { select: { displayName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

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

    const data = items.map((item: { id: string; userId: string | null; displayName: string | null; title: string; body: string; category: string; status: string; upvoteCount: number; isKnownIssue: boolean; knownIssueStatus: string | null; createdAt: Date; replies: { id: string; body: string; createdAt: Date; user: { displayName: string | null } }[] }) => ({
      id: item.id,
      displayName: item.displayName,
      title: item.title,
      body: item.body,
      category: item.category,
      status: item.status,
      upvoteCount: item.upvoteCount,
      replyCount: item.replies.length,
      isKnownIssue: item.isKnownIssue,
      knownIssueStatus: item.knownIssueStatus,
      createdAt: item.createdAt.toISOString(),
      hasVoted: votedSet.has(item.id),
      isOwner: request.userId ? item.userId === request.userId : false,
      replies: item.replies.map((r) => ({
        id: r.id,
        body: r.body,
        adminName: r.user.displayName || "MileClear Team",
        createdAt: r.createdAt.toISOString(),
      })),
    }));

    return reply.send({ data });
  });

  // GET /feedback/board — "You asked, we built" (6 Oct 2026)
  app.get("/board", { preHandler: [optionalAuthMiddleware] }, async (request, reply) => {
    const userId = request.userId ?? null;
    const items = await prisma.feedback.findMany({
      where: {
        category: { not: "bug_report" },
        OR: [{ status: { in: ["planned", "in_progress", "done"] } }, ...(userId ? [{ userId }] : [])],
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        userId: true,
        displayName: true,
        title: true,
        body: true,
        category: true,
        status: true,
        upvoteCount: true,
        isKnownIssue: true,
        knownIssueStatus: true,
        shippedNote: true,
        shippedAt: true,
        createdAt: true,
        replies: {
          select: { id: true, body: true, createdAt: true, user: { select: { displayName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const board = buildBoard(items, userId);
    const shape = (item: (typeof items)[number]) => ({
      id: item.id,
      displayName: item.displayName,
      title: item.title,
      body: item.body,
      category: item.category,
      status: item.status,
      upvoteCount: item.upvoteCount,
      replyCount: item.replies.length,
      isKnownIssue: item.isKnownIssue,
      knownIssueStatus: item.knownIssueStatus,
      createdAt: item.createdAt.toISOString(),
      isOwner: userId ? item.userId === userId : false,
      shippedNote: item.shippedNote,
      shippedAt: item.shippedAt ? item.shippedAt.toISOString() : null,
      replies: item.replies.map((r) => ({
        id: r.id,
        body: r.body,
        adminName: r.user.displayName || "MileClear Team",
        createdAt: r.createdAt.toISOString(),
      })),
    });
    return reply.send({
      data: { onTheList: board.onTheList.map(shape), built: board.built.map(shape), mine: board.mine.map(shape) },
    });
  });

  // GET /feedback — list (optional auth for hasVoted)
  app.get("/", { preHandler: [optionalAuthMiddleware] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query parameters" });
    }

    const { page, pageSize, category, status, sort } = parsed.data;

    // Since 6 Oct 2026 the public list is ideas the admin has picked up, plus
    // the caller's own; problem reports are private. Admins still see all.
    const where: Record<string, unknown> = legacyListVisibility(request.userId ?? null, request.isAdmin === true);
    if (category) where.category = category === "bug_report" && !request.isAdmin ? "__none__" : category;
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
          isKnownIssue: true,
          knownIssueStatus: true,
          createdAt: true,
          replies: {
            select: {
              id: true,
              body: true,
              createdAt: true,
              user: { select: { displayName: true } },
            },
            orderBy: { createdAt: "asc" },
          },
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

    const data = items.map((item: { id: string; userId: string | null; displayName: string | null; title: string; body: string; category: string; status: string; upvoteCount: number; isKnownIssue: boolean; knownIssueStatus: string | null; createdAt: Date; replies: { id: string; body: string; createdAt: Date; user: { displayName: string | null } }[] }) => ({
      id: item.id,
      displayName: item.displayName,
      title: item.title,
      body: item.body,
      category: item.category,
      status: item.status,
      upvoteCount: item.upvoteCount,
      replyCount: item.replies.length,
      isKnownIssue: item.isKnownIssue,
      knownIssueStatus: item.knownIssueStatus,
      createdAt: item.createdAt.toISOString(),
      hasVoted: votedSet.has(item.id),
      isOwner: request.userId ? item.userId === request.userId : false,
      replies: item.replies.map((r) => ({
        id: r.id,
        body: r.body,
        adminName: r.user.displayName || "MileClear Team",
        createdAt: r.createdAt.toISOString(),
      })),
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

    const { status, shippedNote } = parsed.data;
    const becomesDone = status === "done" && feedback.status !== "done";
    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(shippedNote !== undefined ? { shippedNote: shippedNote ? sanitizeText(shippedNote) : null } : {}),
        ...(becomesDone && !feedback.shippedAt ? { shippedAt: new Date() } : {}),
      },
    });

    // Tell whoever suggested it. Bug reports aren't ideas, so they don't get this.
    if (becomesDone && feedback.userId && feedback.category !== "bug_report") {
      const authorId = feedback.userId;
      const note = updated.shippedNote;
      void (async () => {
        try {
          await sendPushToUser(
            authorId,
            "Your idea is in MileClear",
            note ? note.slice(0, 120) : feedback.title.slice(0, 120),
            { action: "feedback_shipped", feedbackId: id }
          );
          const author = await prisma.user.findUnique({
            where: { id: authorId },
            select: { email: true, displayName: true },
          });
          if (author) await sendFeedbackShippedNotification(author.email, author.displayName, feedback.title, note);
          logEvent("feedback.shipped_notified", authorId, { feedbackId: id });
        } catch (err) {
          console.error("[feedback] shipped notification failed:", err);
        }
      })();
    }

    return reply.send({ data: updated, message: "Status updated" });
  });

  // PATCH /feedback/:id/known-issue — admin only
  app.patch("/:id/known-issue", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    const paramsParsed = idParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: "Invalid feedback ID" });
    }
    const { id } = paramsParsed.data;

    const parsed = knownIssueSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid known issue data" });
    }

    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      return reply.status(404).send({ error: "Feedback not found" });
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        isKnownIssue: parsed.data.isKnownIssue,
        knownIssueStatus: parsed.data.isKnownIssue ? parsed.data.knownIssueStatus : null,
      },
    });

    return reply.send({ data: updated, message: parsed.data.isKnownIssue ? "Marked as known issue" : "Removed from known issues" });
  });

  // POST /feedback/:id/reply — admin only
  app.post("/:id/reply", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    const paramsParsed = idParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: "Invalid feedback ID" });
    }
    const { id } = paramsParsed.data;

    const parsed = replySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Reply body is required (1-2000 chars)" });
    }

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      select: { id: true, userId: true, title: true },
    });
    if (!feedback) {
      return reply.status(404).send({ error: "Feedback not found" });
    }

    const replyRecord = await prisma.feedbackReply.create({
      data: {
        feedbackId: id,
        userId: request.userId!,
        body: sanitizeText(parsed.data.body),
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { displayName: true } },
      },
    });

    // Send notification email to feedback author (fire-and-forget)
    if (feedback.userId) {
      prisma.user
        .findUnique({ where: { id: feedback.userId }, select: { email: true, displayName: true } })
        .then((feedbackAuthor) => {
          if (feedbackAuthor) {
            sendFeedbackReplyNotification(
              feedbackAuthor.email,
              feedbackAuthor.displayName,
              feedback.title,
              sanitizeText(parsed.data.body)
            ).catch((err) => console.error("[feedback] Reply notification email failed:", err));
          }
        })
        .catch(() => {});
    }

    return reply.status(201).send({
      data: {
        id: replyRecord.id,
        body: replyRecord.body,
        adminName: replyRecord.user.displayName || "MileClear Team",
        createdAt: replyRecord.createdAt.toISOString(),
      },
      message: "Reply posted",
    });
  });

  // DELETE /feedback/reply/:id — admin only
  app.delete("/reply/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    const paramsParsed = idParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ error: "Invalid reply ID" });
    }
    const { id } = paramsParsed.data;

    const replyRecord = await prisma.feedbackReply.findUnique({ where: { id } });
    if (!replyRecord) {
      return reply.status(404).send({ error: "Reply not found" });
    }

    await prisma.feedbackReply.delete({ where: { id } });
    return reply.send({ message: "Reply deleted" });
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
