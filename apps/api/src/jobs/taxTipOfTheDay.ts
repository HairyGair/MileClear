// Tax tip of the day — daily cron post to #tax-and-hmrc.
//
// Picks a tip from the content bank (see services/taxTips.ts) that
// hasn't been posted in the last 30 days, formats an embed, posts via
// the channel webhook. Logs the post as an AppEvent so the next run's
// dedup works.
//
// Schedules itself to fire once per UK morning. The job runs hourly
// (alongside the other cron jobs in startNotificationJobs); inside
// the function we gate on hour-of-day AND "already posted today" so
// repeated calls in the same morning produce exactly one post.
//
// Phase 1C of the Discord roadmap (21 May 2026).

import { prisma } from "../lib/prisma.js";
import { selectTodaysTip, type TaxTipCategory } from "../services/taxTips.js";
import { postToChannel } from "../services/discord.js";

const APP_EVENT_TYPE = "discord.tax_tip_posted";
const DEDUP_DAYS = 30;

// Time window — fire at 8am UK local. The hourly cron will hit this
// window once per day; the AppEvent dedup ensures we only actually
// post on the first hit of each day.
const POST_HOUR_LOCAL = 8;
const POST_TZ = "Europe/London";

const COLOUR_BY_CATEGORY: Record<TaxTipCategory, number> = {
  expenses: 0xfbbf24,        // amber
  deadlines: 0xef4444,       // red
  "self-assessment": 0x38bdf8, // sky
  "did-you-know": 0x10b981,   // emerald
  mistakes: 0xf59e0b,        // deeper amber
  mileclear: 0xa78bfa,       // violet
};

const FOOTER_BY_CATEGORY: Record<TaxTipCategory, string> = {
  expenses: "Tax tip · allowable expense",
  deadlines: "Tax tip · HMRC deadline",
  "self-assessment": "Tax tip · Self Assessment",
  "did-you-know": "Tax tip · did you know",
  mistakes: "Tax tip · common mistake",
  mileclear: "MileClear tip",
};

function localHourIn(tz: string): number {
  // Intl gives a string like "07" — parse to int. Cheap + accurate
  // across BST/GMT transitions without pulling a TZ library.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: tz,
  });
  return parseInt(fmt.format(new Date()), 10);
}

export async function runTaxTipOfTheDayJob(): Promise<void> {
  if (!process.env.DISCORD_WEBHOOK_TAXTIPS) {
    // Channel webhook isn't configured — silent skip so the cron is
    // safe to schedule even before Discord is fully set up.
    return;
  }

  // Only fire during the morning window (8am UK).
  const hour = localHourIn(POST_TZ);
  if (hour !== POST_HOUR_LOCAL) return;

  // Dedup: have we already posted a tip today?
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const alreadyToday = await prisma.appEvent.findFirst({
    where: { type: APP_EVENT_TYPE, createdAt: { gte: todayStart } },
    select: { id: true },
  });
  if (alreadyToday) return;

  // Recent-tip IDs for selection dedup (don't repeat within 30 days).
  const dedupCutoff = new Date(Date.now() - DEDUP_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.appEvent.findMany({
    where: { type: APP_EVENT_TYPE, createdAt: { gte: dedupCutoff } },
    select: { metadata: true },
    take: 100,
  });
  const recentIds: string[] = recent
    .map((r) => {
      try {
        const meta = r.metadata as { tipId?: string } | null;
        return meta?.tipId ?? null;
      } catch {
        return null;
      }
    })
    .filter((id): id is string => !!id);

  const tip = selectTodaysTip({ recentlyPostedIds: recentIds });
  if (!tip) {
    console.warn("[taxTipOfTheDay] no eligible tip found");
    return;
  }

  const posted = await postToChannel("taxTips", {
    embeds: [
      {
        title: tip.title,
        description: tip.body,
        color: COLOUR_BY_CATEGORY[tip.category],
        footer: { text: FOOTER_BY_CATEGORY[tip.category] },
        timestamp: new Date().toISOString(),
      },
    ],
    suppressMentions: true,
  });

  if (!posted) {
    console.warn(`[taxTipOfTheDay] post failed for tip ${tip.id}`);
    return;
  }

  // Log the post so we don't repeat tomorrow + so the 30-day dedup
  // works on the next run.
  await prisma.appEvent.create({
    data: {
      type: APP_EVENT_TYPE,
      userId: null,
      metadata: { tipId: tip.id, category: tip.category, title: tip.title },
    },
  });

  console.log(`[taxTipOfTheDay] posted ${tip.id} (${tip.category})`);
}
