import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../lib/push.js";
import { logEvent } from "./appEvents.js";
import { postFounderAlert } from "./discord.js";
import { buildDeviceContext } from "./supportContext.js";

// In-app problem reports and replies (feedback redesign, 6 Oct 2026). They
// are SupportEmail rows with channel "app", so they sit in the admin Inbox
// beside support@ email and are answered from the same place. Private: never
// on the public feedback board.

export const MAX_SCREENSHOTS = 3;
export const MAX_SCREENSHOT_BYTES = 1.5 * 1024 * 1024;

export type ScreenshotInput = { mime: string; base64: string };
export type DecodedImage = { mime: "image/jpeg" | "image/png"; data: Buffer };

/** The mime a buffer really is, by its first bytes; null if neither. */
export function sniffImageMime(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  return null;
}

/** Pure: checks count, type and size. The stored mime is the sniffed one. */
export function decodeScreenshots(
  list: ScreenshotInput[] | undefined
): { ok: true; images: DecodedImage[] } | { ok: false; error: string } {
  if (!list || list.length === 0) return { ok: true, images: [] };
  if (list.length > MAX_SCREENSHOTS) return { ok: false, error: `You can attach up to ${MAX_SCREENSHOTS} screenshots.` };
  const images: DecodedImage[] = [];
  for (const s of list) {
    const raw = s.base64.replace(/^data:[^;]+;base64,/, "");
    const data = Buffer.from(raw, "base64");
    if (data.length === 0) return { ok: false, error: "One of the screenshots was empty." };
    if (data.length > MAX_SCREENSHOT_BYTES) return { ok: false, error: "One of the screenshots is too large. Try a smaller one." };
    const mime = sniffImageMime(data);
    if (!mime) return { ok: false, error: "Screenshots must be JPEG or PNG images." };
    images.push({ mime, data });
  }
  return { ok: true, images };
}

/** Pure: the thread subject, from the driver's own words if none was given. */
export function reportSubject(subject: string | undefined | null, body: string): string {
  const s = subject?.trim();
  if (s) return s.slice(0, 120);
  const firstLine = body.trim().split(/\r?\n/)[0].replace(/\s+/g, " ");
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}...` : firstLine || "Problem report";
}

/** Pure: an old app's "bug report" becomes a private report, not a public post. */
export function isPrivateFeedbackCategory(category: string): boolean {
  return category === "bug_report";
}

async function notifyAdmins(title: string, detail: string, userId: string): Promise<void> {
  try {
    await postFounderAlert({
      severity: "info",
      title,
      detail: detail.slice(0, 400),
      userId,
      link: "https://mileclear.com/dashboard/admin/inbox",
    });
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, pushToken: { not: null } },
      select: { id: true },
    });
    for (const a of admins) {
      await sendPushToUser(a.id, title, detail.slice(0, 120), { action: "open_admin_inbox" }, { ignoreQuietHours: true }).catch(() => {});
    }
  } catch (err) {
    console.error("[support] admin alert failed:", err);
  }
}

async function storeAppMessage(args: {
  threadKey: string;
  userId: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  images: DecodedImage[];
}): Promise<{ id: string; fromName: string }> {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { email: true, displayName: true, fullName: true },
  });
  if (!user) throw new Error("User not found");
  const context = await buildDeviceContext(args.userId);
  const fromName = user.fullName || user.displayName || user.email;
  const row = await prisma.supportEmail.create({
    data: {
      messageId: `app-${randomUUID()}@mileclear.com`,
      threadKey: args.threadKey,
      direction: "in",
      fromEmail: user.email,
      fromName,
      toEmail: "support@mileclear.com",
      subject: args.subject,
      textBody: args.body,
      inReplyTo: args.inReplyTo ?? null,
      userId: args.userId,
      status: "open",
      channel: "app",
      context: context as object,
      receivedAt: new Date(),
      screenshots: args.images.length
        ? { create: args.images.map((i) => ({ mime: i.mime, data: new Uint8Array(i.data) })) }
        : undefined,
    },
    select: { id: true },
  });
  return { id: row.id, fromName };
}

/** A new private problem report from the app. Returns its thread key. */
export async function createAppReport(args: {
  userId: string;
  subject?: string | null;
  body: string;
  images: DecodedImage[];
  source?: "report" | "old_feedback_form";
}): Promise<string> {
  const threadKey = `app-${randomUUID()}`;
  const subject = reportSubject(args.subject, args.body);
  const { fromName } = await storeAppMessage({
    threadKey,
    userId: args.userId,
    subject,
    body: args.body,
    images: args.images,
  });
  logEvent("support.app_report", args.userId, {
    threadKey,
    screenshots: args.images.length,
    source: args.source ?? "report",
  });
  void notifyAdmins(`Problem report from ${fromName}`, `${subject}\n\n${args.body}`, args.userId);
  return threadKey;
}

/** The driver answers in an existing thread. Reopens it for the admin. */
export async function addAppReply(args: {
  userId: string;
  threadKey: string;
  body: string;
  images: DecodedImage[];
}): Promise<void> {
  const last = await prisma.supportEmail.findFirst({
    where: { threadKey: args.threadKey },
    orderBy: { receivedAt: "desc" },
    select: { messageId: true, subject: true },
  });
  const first = await prisma.supportEmail.findFirst({
    where: { threadKey: args.threadKey },
    orderBy: { receivedAt: "asc" },
    select: { subject: true },
  });
  const base = first?.subject ?? last?.subject ?? "Problem report";
  const subject = /^\s*re\s*:/i.test(base) ? base : `Re: ${base}`;
  const { fromName } = await storeAppMessage({
    threadKey: args.threadKey,
    userId: args.userId,
    subject,
    body: args.body,
    inReplyTo: last?.messageId ?? null,
    images: args.images,
  });
  logEvent("support.app_reply", args.userId, { threadKey: args.threadKey, screenshots: args.images.length });
  void notifyAdmins(`Reply from ${fromName}`, `${base}\n\n${args.body}`, args.userId);
}

/**
 * Whether a thread belongs to this driver: no message carries another
 * account, it isn't spam, and either a message carries their account or we
 * wrote to their email address in it (older email threads have no userId).
 */
export function threadBelongsTo(
  messages: { userId: string | null; isSpam: boolean; direction: string; toEmail: string | null }[],
  userId: string,
  email: string
): boolean {
  if (messages.length === 0) return false;
  if (messages.some((m) => m.isSpam)) return false;
  if (messages.some((m) => m.userId && m.userId !== userId)) return false;
  const mail = email.toLowerCase();
  return messages.some(
    (m) => m.userId === userId || (m.direction === "out" && (m.toEmail ?? "").toLowerCase() === mail)
  );
}
