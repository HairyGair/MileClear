/**
 * EmSee (Oct 2026): passes a driver's suggestion, problem report or message
 * on to the MileClear team. Called by the assistant's `message_the_team`
 * tool. Goes to the support inbox with the driver's email as Reply-To, so a
 * reply from the inbox reaches them directly, plus a Discord founder alert
 * and an admin push, the same as a feedback submission.
 *
 * Private: never written to the public feedback board.
 * Capped at MESSAGE_DAILY_LIMIT per driver per UK day, and the same text
 * twice in a day is only sent once.
 */

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../lib/push.js";
import { logEvent } from "./appEvents.js";
import { postFounderAlert } from "./discord.js";
import { sendAdminEmail } from "./email.js";

export const MESSAGE_SENT_EVENT = "assistant.message_sent";
export const MESSAGE_DAILY_LIMIT = 3;
const TEAM_INBOX = process.env.SUPPORT_INBOX || "support@mileclear.com";

export const KIND_LABELS = {
  suggestion: "Suggestion",
  problem: "Problem",
  other: "Message",
} as const;

export const messageInput = z
  .object({
    kind: z.enum(["suggestion", "problem", "other"]),
    message: z.string().trim().min(3).max(1500),
  })
  .strict();

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function startOfUkDay(now: Date): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
  // Midnight UK is 23:00 or 00:00 UTC; take the earlier so nothing slips through.
  return new Date(`${day}T00:00:00+01:00`);
}

export async function messageTheTeam(userId: string, rawInput: unknown, now: Date) {
  const input = messageInput.parse(rawInput);

  const today = await prisma.appEvent.findMany({
    where: { userId, type: MESSAGE_SENT_EVENT, createdAt: { gte: startOfUkDay(now) } },
    select: { metadata: true },
  });
  if (today.some((e) => (e.metadata as { message?: string } | null)?.message === input.message)) {
    return { sent: true, note: "Already passed on earlier today." };
  }
  if (today.length >= MESSAGE_DAILY_LIMIT) {
    return {
      sent: false,
      note: `Not sent: ${MESSAGE_DAILY_LIMIT} messages a day is the limit. The driver can email support@mileclear.com.`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true, fullName: true },
  });
  if (!user) return { sent: false, note: "Not sent." };

  const name = user.fullName || user.displayName || user.email;
  const label = KIND_LABELS[input.kind];

  logEvent(MESSAGE_SENT_EVENT, userId, { kind: input.kind, message: input.message });

  await sendAdminEmail({
    to: TEAM_INBOX,
    replyTo: `${name.replace(/["<>]/g, "")} <${user.email}>`,
    subject: `EmSee: ${label.toLowerCase()} from ${name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a; margin: 0 0 8px;">${label} passed on by EmSee</h2>
        <p style="color: #555; font-size: 14px; margin: 0;"><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(user.email)}&gt;</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 20px 0; color: #1a1a1a; font-size: 15px; line-height: 1.6;">${escapeHtml(input.message).replace(/\n/g, "<br/>")}</div>
        <p style="color: #888; font-size: 12px;">Written by the driver's assistant from what they said. Reply to this email to answer them directly.</p>
      </div>`,
    text: `${label} from ${name} <${user.email}>:\n\n${input.message}`,
  });

  void (async () => {
    try {
      await postFounderAlert({
        severity: "info",
        title: `EmSee ${label.toLowerCase()} from ${name}`,
        detail: input.message.slice(0, 400),
        userId,
      });
      const admins = await prisma.user.findMany({
        where: { isAdmin: true, pushToken: { not: null } },
        select: { id: true },
      });
      for (const a of admins) {
        await sendPushToUser(a.id, `EmSee ${label.toLowerCase()}`, `${name}: ${input.message.slice(0, 120)}`, { action: "open_feedback" }, { ignoreQuietHours: true }).catch(() => {});
      }
    } catch (err) {
      console.error("[assistant] team message alert failed:", err);
    }
  })();

  return { sent: true, note: "Passed on to Anthony and the MileClear team. They reply by email." };
}
