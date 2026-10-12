// Practice accounts housekeeping (Accountant mode phase 1, Oct 2026).
// Every 6 hours (the runAll loop in jobs/notifications.ts):
//
//   - 30 days before a link ends (31 January), ask the driver once to keep
//     sharing; 7 days before, remind them once more. No answer: the link
//     simply ends on the date (access checks fail closed on endsAt, so no
//     state change is needed for that).
//   - Close requests whose condition is now met (sort trips, add earnings).
//   - Delete access-log rows older than two years (A10).
//
// Pushes carry data.action so the app opens the right screen.

import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../lib/push.js";
import { RENEWAL_ASK_DAYS, RENEWAL_REMIND_DAYS, shortDate, ukDateKey } from "@mileclear/shared";
import { refreshAutoRequests } from "../services/practice/requests.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACCESS_LOG_KEEP_DAYS = 730;

/** Pure: which renewal message (if any) a link is due at `now`. */
export function renewalStage(
  link: { endsAt: Date | null; renewalAskedAt: Date | null; renewalRemindedAt: Date | null },
  now: Date
): "ask" | "remind" | null {
  if (!link.endsAt || link.endsAt.getTime() <= now.getTime()) return null;
  const left = link.endsAt.getTime() - now.getTime();
  if (left <= RENEWAL_REMIND_DAYS * DAY_MS && link.renewalAskedAt && !link.renewalRemindedAt) return "remind";
  if (left <= RENEWAL_ASK_DAYS * DAY_MS && !link.renewalAskedAt) return "ask";
  return null;
}

export async function runPracticeLinksJob(now = new Date()): Promise<void> {
  const due = await prisma.practiceLink.findMany({
    where: {
      status: "active",
      endsAt: { gt: now, lte: new Date(now.getTime() + RENEWAL_ASK_DAYS * DAY_MS) },
      clientUserId: { not: null },
      practice: { suspendedAt: null },
    },
    select: {
      id: true,
      clientUserId: true,
      endsAt: true,
      renewalAskedAt: true,
      renewalRemindedAt: true,
      practice: { select: { name: true } },
    },
  });
  for (const l of due) {
    const stage = renewalStage(l, now);
    if (!stage || !l.practice) continue;
    // Mark first, so a crash between the two can never send it twice.
    await prisma.practiceLink.update({
      where: { id: l.id },
      data: stage === "ask" ? { renewalAskedAt: now } : { renewalRemindedAt: now },
    });
    const ends = shortDate(ukDateKey(l.endsAt!));
    sendPushToUser(
      l.clientUserId!,
      `Keep sharing with ${l.practice.name}?`,
      `Sharing ends on ${ends}. Keep it going for another year.`,
      { action: "practice_renewal", linkId: l.id }
    ).catch(() => {});
  }

  const open = await prisma.practiceRequest.findMany({
    where: { status: "open", type: { in: ["sort_trips", "add_earnings"] } },
    select: { clientUserId: true },
    distinct: ["clientUserId"],
    take: 2000,
  });
  await refreshAutoRequests(open.map((o) => o.clientUserId), now);

  const purged = await prisma.practiceAccessLog.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - ACCESS_LOG_KEEP_DAYS * DAY_MS) } },
  });
  if (due.length || purged.count) {
    console.log(`[practice] renewal checks ${due.length}, access log rows purged ${purged.count}`);
  }
}
