/**
 * Support inbox (Oct 2026): every email to support@mileclear.com, readable
 * and answerable from the admin.
 *
 * Delivery: a cPanel forwarder pipes each message to
 * ~/bin/support-inbox-pipe.sh, which only writes the raw message into
 * SUPPORT_SPOOL_DIR/new (and always exits 0, so a fault here can never bounce
 * mail back to the sender). The mailbox and the forward to gair@ carry on as
 * before. `ingestSupportSpool` claims each file by renaming it (atomic, so
 * two API processes can't both take it), parses it and stores it.
 *
 * Attachments are listed by name and size only; their content stays in the
 * mailbox.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import PostalMime from "postal-mime";
import { prisma } from "../lib/prisma.js";

export const MAX_BODY_CHARS = 200_000;
/** Our own sending addresses: mail from these is a relay (contact form,
 *  EmSee) and the real counterpart is the Reply-To. */
const OWN_ADDRESS = /@mileclear\.com$/i;

export interface ParsedSupportEmail {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string;
  textBody: string;
  attachments: { filename: string; mimeType: string; size: number }[];
  isSpam: boolean;
  receivedAt: Date;
}

function cleanId(id: string | undefined | null): string | null {
  if (!id) return null;
  const t = id.trim().replace(/^<|>$/g, "").trim();
  return t ? t.slice(0, 255) : null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Re: Fwd: RE: Missing trip" -> "missing trip" */
export function normaliseSubject(subject: string): string {
  return subject
    .replace(/^\s*((re|fwd?|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function parseSupportEmail(raw: Buffer | string, now = new Date()): Promise<ParsedSupportEmail> {
  const email = await PostalMime.parse(raw);
  const header = (name: string) =>
    email.headers.find((h) => h.key.toLowerCase() === name)?.value ?? "";

  const from = email.from;
  const replyTo = email.replyTo?.[0];
  // Relayed mail (contact form, EmSee) comes from our own address with the
  // driver in Reply-To; answer the driver, not ourselves.
  const counterpart =
    from?.address && OWN_ADDRESS.test(from.address) && replyTo?.address ? replyTo : from;

  const spamStatus = header("x-spam-status");
  const isSpam =
    /^yes/i.test(header("x-spam-flag")) || /^yes/i.test(spamStatus) || /^\s*\*+\s*spam/i.test(email.subject ?? "");

  const text = email.text?.trim() || (email.html ? htmlToText(email.html) : "");
  const date = email.date ? new Date(email.date) : now;

  return {
    messageId: cleanId(email.messageId) ?? `local-${now.getTime()}-${Math.random().toString(36).slice(2)}`,
    inReplyTo: cleanId(email.inReplyTo),
    references: (email.references ?? "")
      .split(/\s+/)
      .map(cleanId)
      .filter((x): x is string => !!x),
    fromEmail: (counterpart?.address ?? "unknown").toLowerCase().slice(0, 255),
    fromName: counterpart?.name?.trim().slice(0, 255) || null,
    toEmail: email.to?.[0]?.address?.toLowerCase().slice(0, 255) ?? null,
    subject: (email.subject ?? "(no subject)").slice(0, 500),
    textBody: text.slice(0, MAX_BODY_CHARS),
    attachments: (email.attachments ?? []).map((a) => ({
      filename: a.filename ?? "attachment",
      mimeType: a.mimeType,
      size: typeof a.content === "string" ? a.content.length : (a.content as ArrayBuffer).byteLength,
    })),
    isSpam,
    // A wildly wrong Date header must not bury the message or float it to the top.
    receivedAt: isNaN(date.getTime()) || Math.abs(date.getTime() - now.getTime()) > 7 * 86_400_000 ? now : date,
  };
}

/** Which thread a new message belongs to: the thread of anything it replies
 *  to, else an open conversation with the same person and subject in the
 *  last 60 days, else a new thread keyed by its own id. */
export async function threadKeyFor(p: Pick<ParsedSupportEmail, "messageId" | "inReplyTo" | "references" | "fromEmail" | "subject" | "receivedAt">): Promise<string> {
  const ids = [p.inReplyTo, ...p.references].filter((x): x is string => !!x);
  if (ids.length) {
    const hit = await prisma.supportEmail.findFirst({
      where: { messageId: { in: ids } },
      select: { threadKey: true },
    });
    if (hit) return hit.threadKey;
  }
  const subject = normaliseSubject(p.subject);
  if (subject) {
    const recent = await prisma.supportEmail.findMany({
      where: {
        OR: [{ fromEmail: p.fromEmail }, { toEmail: p.fromEmail }],
        receivedAt: { gte: new Date(p.receivedAt.getTime() - 60 * 86_400_000) },
      },
      select: { threadKey: true, subject: true },
      orderBy: { receivedAt: "desc" },
      take: 50,
    });
    const same = recent.find((r) => normaliseSubject(r.subject) === subject);
    if (same) return same.threadKey;
  }
  return p.messageId;
}

export async function storeSupportEmail(p: ParsedSupportEmail): Promise<"stored" | "duplicate"> {
  const exists = await prisma.supportEmail.findUnique({ where: { messageId: p.messageId }, select: { id: true } });
  if (exists) return "duplicate";
  const [threadKey, user] = await Promise.all([
    threadKeyFor(p),
    prisma.user.findFirst({ where: { email: p.fromEmail }, select: { id: true } }),
  ]);
  await prisma.supportEmail.create({
    data: {
      messageId: p.messageId,
      threadKey,
      direction: "in",
      fromEmail: p.fromEmail,
      fromName: p.fromName,
      toEmail: p.toEmail,
      subject: p.subject,
      textBody: p.textBody,
      inReplyTo: p.inReplyTo,
      attachments: p.attachments.length ? p.attachments : undefined,
      userId: user?.id ?? null,
      status: p.isSpam ? "spam" : "open",
      isSpam: p.isSpam,
      receivedAt: p.receivedAt,
    },
  });
  return "stored";
}

/** Read every waiting message in the spool. Safe to run from more than one
 *  process: a file is claimed by renaming it out of new/. */
export async function ingestSupportSpool(dir: string): Promise<{ stored: number; duplicate: number; failed: number }> {
  const out = { stored: 0, duplicate: 0, failed: 0 };
  const newDir = path.join(dir, "new");
  const workDir = path.join(dir, "work");
  const doneDir = path.join(dir, "done");
  const failedDir = path.join(dir, "failed");
  await Promise.all([workDir, doneDir, failedDir].map((d) => fs.mkdir(d, { recursive: true })));

  let names: string[];
  try {
    names = (await fs.readdir(newDir)).filter((n) => !n.startsWith(".")).sort();
  } catch {
    return out;
  }
  for (const name of names.slice(0, 50)) {
    const claimed = path.join(workDir, name);
    try {
      await fs.rename(path.join(newDir, name), claimed);
    } catch {
      continue; // another process took it
    }
    try {
      const raw = await fs.readFile(claimed);
      const result = await storeSupportEmail(await parseSupportEmail(raw));
      out[result]++;
      await fs.rename(claimed, path.join(doneDir, name));
    } catch (err) {
      out.failed++;
      console.error("[support-inbox] could not store %s:", name, err instanceof Error ? err.message : err);
      await fs.rename(claimed, path.join(failedDir, name)).catch(() => {});
    }
  }
  return out;
}
