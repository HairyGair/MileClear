import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { sendSupportReply } from "../../services/email.js";
import { sendPushToUser } from "../../lib/push.js";
import { normaliseSubject } from "../../services/supportInbox.js";

// Support inbox (Oct 2026): every email to support@ as threads, with the
// driver's account beside it and replies sent from here. Registered inside
// adminRoutes, so auth + admin hooks already apply.

const STATUSES = ["open", "replied", "closed", "spam"] as const;

const listQuery = z.object({
  status: z.enum([...STATUSES, "all"]).default("open"),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const replyBody = z.object({ text: z.string().trim().min(1).max(20_000) });
const statusBody = z.object({ status: z.enum(STATUSES) });

const msgSelect = {
  id: true,
  messageId: true,
  threadKey: true,
  direction: true,
  fromEmail: true,
  fromName: true,
  toEmail: true,
  subject: true,
  status: true,
  isSpam: true,
  userId: true,
  receivedAt: true,
  channel: true,
} as const;

export async function adminSupportInboxRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /admin/support-inbox ─────────────────────────────────────────────
  // Threads, newest activity first. A thread's status is its latest message's.
  app.get("/support-inbox", async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid query" });
    const { status, q, limit } = parsed.data;

    const since = new Date(Date.now() - 365 * 86_400_000);
    const rows = await prisma.supportEmail.findMany({
      where: {
        receivedAt: { gte: since },
        ...(q
          ? {
              OR: [
                { fromEmail: { contains: q } },
                { fromName: { contains: q } },
                { subject: { contains: q } },
                { toEmail: { contains: q } },
              ],
            }
          : {}),
      },
      select: msgSelect,
      orderBy: { receivedAt: "desc" },
      take: 3000,
    });

    const threads = new Map<string, { latest: (typeof rows)[number]; count: number; firstIn: (typeof rows)[number] | null; app: boolean }>();
    for (const r of rows) {
      const t = threads.get(r.threadKey);
      if (!t) threads.set(r.threadKey, { latest: r, count: 1, firstIn: r.direction === "in" ? r : null, app: r.channel === "app" });
      else {
        t.count++;
        if (r.direction === "in") t.firstIn = r; // rows are newest first, so this ends on the oldest
        if (r.channel === "app") t.app = true;
      }
    }

    const counts: Record<string, number> = { open: 0, replied: 0, closed: 0, spam: 0 };
    for (const t of threads.values()) counts[t.latest.status] = (counts[t.latest.status] ?? 0) + 1;

    const picked = [...threads.values()]
      .filter((t) => status === "all" || t.latest.status === status)
      .slice(0, limit);

    const userIds = [...new Set(picked.map((t) => (t.firstIn ?? t.latest).userId).filter((x): x is string => !!x))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, displayName: true, isPremium: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return reply.send({
      data: {
        counts,
        threads: picked.map(({ latest, count, firstIn, app }) => {
          const who = firstIn ?? latest;
          return {
            threadKey: latest.threadKey,
            subject: (firstIn ?? latest).subject,
            contactEmail: who.direction === "in" ? who.fromEmail : who.toEmail,
            contactName: who.direction === "in" ? who.fromName : null,
            status: latest.status,
            lastDirection: latest.direction,
            lastAt: latest.receivedAt,
            messageCount: count,
            // "app" when any message in it was written in the app (problem report / in-app reply).
            channel: app ? "app" : "email",
            user: who.userId ? byId.get(who.userId) ?? null : null,
          };
        }),
      },
    });
  });

  // ── GET /admin/support-inbox/thread?key= ─────────────────────────────────
  // Message ids contain "/" and "@", so the key travels as a query value.
  app.get("/support-inbox/thread", async (request, reply) => {
    const key = z.object({ key: z.string().min(1).max(255) }).safeParse(request.query);
    if (!key.success) return reply.status(400).send({ error: "Missing key" });

    const messages = await prisma.supportEmail.findMany({
      where: { threadKey: key.data.key },
      orderBy: { receivedAt: "asc" },
      include: { screenshots: { select: { id: true, mime: true } } },
    });
    if (!messages.length) return reply.status(404).send({ error: "Not found" });

    const firstIn = messages.find((m) => m.direction === "in") ?? messages[0];
    const userId = messages.find((m) => m.userId)?.userId ?? null;
    const user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            displayName: true,
            fullName: true,
            isPremium: true,
            createdAt: true,
            appVersion: true,
            buildNumber: true,
            _count: { select: { trips: true } },
          },
        }).catch(() => null)
      : null;

    return reply.send({
      data: {
        threadKey: key.data.key,
        subject: firstIn.subject,
        contactEmail: firstIn.direction === "in" ? firstIn.fromEmail : firstIn.toEmail,
        status: messages[messages.length - 1].status,
        user: user
          ? {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              fullName: user.fullName,
              isPremium: user.isPremium,
              createdAt: user.createdAt,
              appVersion: user.appVersion,
              buildNumber: user.buildNumber,
              tripCount: user._count.trips,
            }
          : null,
        messages: messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          fromEmail: m.fromEmail,
          fromName: m.fromName,
          toEmail: m.toEmail,
          subject: m.subject,
          textBody: m.textBody,
          // One list: email attachments ({ filename, mimeType, size }, listed
          // only, content stays in the mailbox) and in-app screenshots
          // ({ id, mime }, served from /admin/support-inbox/attachments/:id).
          attachments: [
            ...(Array.isArray(m.attachments) ? (m.attachments as unknown[]) : []),
            ...m.screenshots.map((a) => ({ id: a.id, mime: a.mime })),
          ],
          channel: m.channel,
          context: m.context,
          readByUserAt: m.readByUserAt,
          isSpam: m.isSpam,
          receivedAt: m.receivedAt,
        })),
      },
    });
  });

  // ── POST /admin/support-inbox/reply?key= ─────────────────────────────────
  app.post("/support-inbox/reply", async (request, reply) => {
    const key = z.object({ key: z.string().min(1).max(255) }).safeParse(request.query);
    const body = replyBody.safeParse(request.body);
    if (!key.success || !body.success) return reply.status(400).send({ error: "Invalid input" });

    const messages = await prisma.supportEmail.findMany({
      where: { threadKey: key.data.key },
      orderBy: { receivedAt: "asc" },
      select: { messageId: true, direction: true, fromEmail: true, toEmail: true, subject: true, userId: true, channel: true },
    });
    const lastIn = [...messages].reverse().find((m) => m.direction === "in");
    if (!lastIn) return reply.status(404).send({ error: "Nothing to reply to" });

    const to = lastIn.fromEmail;
    const base = messages[0].subject;
    const subject = /^\s*re\s*:/i.test(base) ? base : `Re: ${base}`;

    let sentId: string;
    try {
      sentId = await sendSupportReply({
        to,
        subject,
        text: body.data.text,
        inReplyTo: lastIn.messageId.startsWith("local-") ? null : lastIn.messageId,
        references: messages.map((m) => m.messageId).filter((id) => !id.startsWith("local-")),
      });
    } catch (err) {
      request.log.error({ err }, "support inbox reply failed");
      return reply.status(502).send({ error: "The email didn't send. Nothing was saved; try again." });
    }

    const userId = messages.find((m) => m.userId)?.userId ?? null;
    await prisma.supportEmail.create({
      data: {
        messageId: sentId,
        threadKey: key.data.key,
        direction: "out",
        fromEmail: "gair@mileclear.com",
        fromName: "Gair - MileClear",
        toEmail: to,
        subject,
        textBody: body.data.text,
        inReplyTo: lastIn.messageId,
        userId,
        status: "replied",
        sentByUserId: request.userId ?? null,
        receivedAt: new Date(),
      },
    });
    logEvent("support.reply_sent", userId, {
      channel: "support_inbox",
      to,
      subject,
      threadKey: key.data.key,
      normalisedSubject: normaliseSubject(subject),
    });

    // The driver also sees the reply in the app (Feedback > Your messages),
    // so tell their phone. Email still goes as before.
    if (userId) {
      sendPushToUser(
        userId,
        "Gair replied to your message",
        body.data.text.replace(/\s+/g, " ").slice(0, 120),
        { action: "support_thread", threadKey: key.data.key }
      ).catch(() => {});
    }
    return reply.send({ data: { sent: true } });
  });

  // ── GET /admin/support-inbox/attachments/:id ─────────────────────────────
  // A screenshot sent with an in-app report or reply.
  app.get("/support-inbox/attachments/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid attachment" });
    const att = await prisma.supportAttachment.findUnique({
      where: { id: params.data.id },
      select: { mime: true, data: true },
    });
    if (!att) return reply.status(404).send({ error: "Not found" });
    return reply
      .header("Content-Type", att.mime)
      .header("Cache-Control", "private, max-age=86400")
      .send(Buffer.from(att.data));
  });

  // ── POST /admin/support-inbox/status?key= ────────────────────────────────
  // Sets the thread's state by updating its latest message.
  app.post("/support-inbox/status", async (request, reply) => {
    const key = z.object({ key: z.string().min(1).max(255) }).safeParse(request.query);
    const body = statusBody.safeParse(request.body);
    if (!key.success || !body.success) return reply.status(400).send({ error: "Invalid input" });
    const latest = await prisma.supportEmail.findFirst({
      where: { threadKey: key.data.key },
      orderBy: { receivedAt: "desc" },
      select: { id: true },
    });
    if (!latest) return reply.status(404).send({ error: "Not found" });
    await prisma.supportEmail.update({
      where: { id: latest.id },
      data: { status: body.data.status, ...(body.data.status === "spam" ? { isSpam: true } : {}) },
    });
    return reply.send({ data: { status: body.data.status } });
  });
}
