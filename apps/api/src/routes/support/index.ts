import { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SupportThreadDetail, SupportThreadSummary } from "@mileclear/shared";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import {
  MAX_SCREENSHOTS,
  addAppReply,
  createAppReport,
  decodeScreenshots,
  threadBelongsTo,
} from "../../services/supportReports.js";

// Private problem reports and their conversations, from the driver's side
// (feedback redesign, 6 Oct 2026). The admin side is /admin/support-inbox.
// Contract: docs/feedback-redesign-oct2026.md.

const screenshotSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png"]),
  base64: z.string().min(1).max(3_000_000),
});

const reportSchema = z.object({
  subject: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(4000),
  screenshots: z.array(screenshotSchema).max(MAX_SCREENSHOTS).optional(),
});

const replySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  screenshots: z.array(screenshotSchema).max(MAX_SCREENSHOTS).optional(),
});

const keyParam = z.object({ key: z.string().min(1).max(255) });

/** A thread's messages, or null when it isn't this driver's. */
async function loadOwnThread(key: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return null;
  const messages = await prisma.supportEmail.findMany({
    where: { threadKey: key },
    orderBy: { receivedAt: "asc" },
    select: {
      id: true,
      direction: true,
      fromName: true,
      subject: true,
      textBody: true,
      userId: true,
      isSpam: true,
      toEmail: true,
      receivedAt: true,
      readByUserAt: true,
      screenshots: { select: { id: true, mime: true } },
    },
  });
  return threadBelongsTo(messages, userId, user.email) ? messages : null;
}

export async function supportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authMiddleware);

  // POST /support/report: a new private problem report.
  app.post("/report", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const shots = decodeScreenshots(parsed.data.screenshots);
    if (!shots.ok) return reply.status(400).send({ error: shots.error });

    const threadKey = await createAppReport({
      userId: request.userId!,
      subject: parsed.data.subject,
      body: parsed.data.body,
      images: shots.images,
    });
    return reply.status(201).send({ data: { threadKey } });
  });

  // GET /support/threads: the driver's conversations, newest first.
  app.get("/threads", async (request, reply) => {
    const userId = request.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return reply.status(404).send({ error: "User not found" });

    // Threads they wrote in the app, plus email threads we've answered them in.
    const seeds = await prisma.supportEmail.findMany({
      where: {
        isSpam: false,
        OR: [
          { userId, channel: "app" },
          { userId, direction: "out" },
          { direction: "out", toEmail: user.email },
        ],
      },
      select: { threadKey: true },
      orderBy: { receivedAt: "desc" },
      take: 500,
    });
    const keys = [...new Set(seeds.map((s) => s.threadKey))].slice(0, 50);
    if (keys.length === 0) return reply.send({ data: [] });

    const rows = await prisma.supportEmail.findMany({
      where: { threadKey: { in: keys } },
      orderBy: { receivedAt: "asc" },
      select: {
        threadKey: true,
        direction: true,
        subject: true,
        userId: true,
        isSpam: true,
        toEmail: true,
        receivedAt: true,
        readByUserAt: true,
      },
    });
    const byKey = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byKey.get(r.threadKey) ?? [];
      list.push(r);
      byKey.set(r.threadKey, list);
    }

    const data: SupportThreadSummary[] = [];
    for (const key of keys) {
      const msgs = byKey.get(key) ?? [];
      if (!threadBelongsTo(msgs, userId, user.email)) continue;
      const last = msgs[msgs.length - 1];
      data.push({
        threadKey: key,
        subject: msgs[0].subject,
        lastAt: last.receivedAt.toISOString(),
        lastDirection: last.direction === "out" ? "out" : "in",
        unread: msgs.some((m) => m.direction === "out" && !m.readByUserAt),
      });
    }
    data.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    return reply.send({ data });
  });

  // GET /support/threads/:key: the conversation. Opening it marks our replies read.
  app.get("/threads/:key", async (request, reply) => {
    const params = keyParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid thread" });
    const userId = request.userId!;
    const messages = await loadOwnThread(params.data.key, userId);
    if (!messages) return reply.status(404).send({ error: "Conversation not found" });

    const unreadIds = messages.filter((m) => m.direction === "out" && !m.readByUserAt).map((m) => m.id);
    if (unreadIds.length) {
      await prisma.supportEmail.updateMany({ where: { id: { in: unreadIds } }, data: { readByUserAt: new Date() } });
    }

    const data: SupportThreadDetail = {
      threadKey: params.data.key,
      subject: messages[0].subject,
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction === "out" ? "out" : "in",
        body: m.textBody,
        at: m.receivedAt.toISOString(),
        fromName: m.direction === "out" ? m.fromName ?? "MileClear" : m.fromName,
        attachments: m.screenshots.map((s) => ({ id: s.id, mime: s.mime })),
      })),
    };
    return reply.send({ data });
  });

  // POST /support/threads/:key/reply: the driver answers in the app.
  app.post("/threads/:key/reply", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    const params = keyParam.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid thread" });
    const parsed = replySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const shots = decodeScreenshots(parsed.data.screenshots);
    if (!shots.ok) return reply.status(400).send({ error: shots.error });

    const userId = request.userId!;
    const messages = await loadOwnThread(params.data.key, userId);
    if (!messages) return reply.status(404).send({ error: "Conversation not found" });

    await addAppReply({ userId, threadKey: params.data.key, body: parsed.data.body, images: shots.images });
    return reply.status(201).send({ data: { sent: true } });
  });

  // GET /support/attachments/:id: a screenshot in one of the driver's own threads.
  app.get("/attachments/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid attachment" });
    const att = await prisma.supportAttachment.findUnique({
      where: { id: params.data.id },
      select: { mime: true, data: true, supportEmail: { select: { threadKey: true } } },
    });
    if (!att) return reply.status(404).send({ error: "Not found" });
    const thread = await loadOwnThread(att.supportEmail.threadKey, request.userId!);
    if (!thread) return reply.status(404).send({ error: "Not found" });
    return reply
      .header("Content-Type", att.mime)
      .header("Cache-Control", "private, max-age=86400")
      .send(Buffer.from(att.data));
  });
}
