// HMRC deadline reminder cron.
//
// Each morning (UK time) checks every deadline in hmrcDeadlines.ts.
// When a deadline is 30 / 14 / 7 / 1 / 0 days away we post a reminder
// to #tax-and-hmrc. Severity escalates as the date approaches —
// sky-blue at 30 days, amber at 14, red at 7 and below.
//
// Dedup is per (deadline_id, days_away) so we never post the same
// "14 days to go" reminder twice, even if the cron runs multiple
// times within the same 24h window.
//
// Phase 2 of the Discord roadmap (21 May 2026).

import { prisma } from "../lib/prisma.js";
import { nextOccurrences } from "../services/hmrcDeadlines.js";
import { postToChannel } from "../services/discord.js";

const APP_EVENT_TYPE = "discord.deadline_reminder_posted";

// Trigger windows. When days_away matches one of these, we post.
const TRIGGER_DAYS = [30, 14, 7, 1, 0] as const;

const POST_HOUR_LOCAL = 8; // same morning slot as the tax tip
const POST_TZ = "Europe/London";

function localHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: POST_TZ,
    }).format(new Date()),
    10
  );
}

function colourFor(days: number): number {
  if (days <= 1) return 0xef4444; // red
  if (days <= 7) return 0xf59e0b; // deep amber
  if (days <= 14) return 0xfbbf24; // amber
  return 0x38bdf8; // sky
}

function urgencyPrefix(days: number): string {
  if (days === 0) return "🚨 TODAY";
  if (days === 1) return "🚨 Tomorrow";
  if (days === 7) return "⏰ 1 week to go";
  if (days === 14) return "📅 2 weeks to go";
  if (days === 30) return "📅 1 month to go";
  return `📅 ${days} days to go`;
}

export async function runTaxDeadlineRemindersJob(): Promise<void> {
  if (!process.env.DISCORD_WEBHOOK_TAXTIPS) return;

  // Only fire in the morning slot. The job runs hourly; the
  // AppEvent dedup ensures only one post per (deadline, day-band).
  if (localHour() !== POST_HOUR_LOCAL) return;

  // Look at the next 60 days of deadlines — any deadline more than
  // 60 days out has no trigger window to hit today.
  const upcoming = nextOccurrences(new Date(), 10);
  const toPost = upcoming.filter((d) =>
    (TRIGGER_DAYS as readonly number[]).includes(d.daysAway)
  );
  if (toPost.length === 0) return;

  for (const deadline of toPost) {
    const dedupKey = `${deadline.id}:${deadline.daysAway}`;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const already = await prisma.appEvent.findFirst({
      where: {
        type: APP_EVENT_TYPE,
        createdAt: { gte: sevenDaysAgo },
        // Filter on metadata.dedupKey — using JSON path query for
        // MySQL would need raw SQL; in-memory check is fine since
        // we only fetch the last week's worth of these.
      },
      select: { metadata: true },
    });
    // Match against in-memory metadata if we got a row back
    if (already) {
      const recentMatches = await prisma.appEvent.findMany({
        where: {
          type: APP_EVENT_TYPE,
          createdAt: { gte: sevenDaysAgo },
        },
        select: { metadata: true },
      });
      const hit = recentMatches.some((r) => {
        const meta = r.metadata as { dedupKey?: string } | null;
        return meta?.dedupKey === dedupKey;
      });
      if (hit) continue;
    }

    const dateStr = deadline.date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const posted = await postToChannel("taxTips", {
      embeds: [
        {
          title: `${urgencyPrefix(deadline.daysAway)} — ${deadline.label}`,
          description: `${deadline.what}\n\n**Date:** ${dateStr}`,
          color: colourFor(deadline.daysAway),
          footer: { text: "MileClear · HMRC deadline reminder" },
          timestamp: new Date().toISOString(),
        },
      ],
      suppressMentions: true,
    });

    if (posted) {
      await prisma.appEvent.create({
        data: {
          type: APP_EVENT_TYPE,
          userId: null,
          metadata: {
            dedupKey,
            deadlineId: deadline.id,
            daysAway: deadline.daysAway,
            date: deadline.date.toISOString(),
          },
        },
      });
      console.log(`[deadlineReminders] posted ${dedupKey}`);
    }
  }
}
