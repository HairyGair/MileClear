// Weekly community digest cron — fires Sunday 9am UK to
// #announcements. Once-per-week post showing aggregated community
// stats: total miles, deductions, top platforms, new drivers,
// milestone crossings.
//
// Schedules with the existing hourly cron tick. Gated on:
//   1. Today is Sunday (UK local)
//   2. Hour is 9 (UK local)
//   3. We haven't already posted a digest this calendar week
//
// Phase 1D of the Discord roadmap (21 May 2026).

import { prisma } from "../lib/prisma.js";
import { buildWeeklyDigest } from "../services/communityDigest.js";
import { postToChannel } from "../services/discord.js";
import { formatMiles, formatPence } from "@mileclear/shared";

const APP_EVENT_TYPE = "discord.weekly_digest_posted";
const POST_HOUR_LOCAL = 9;
const POST_DAY_LOCAL = 0; // Sunday in Date.getDay() (0=Sun)
const POST_TZ = "Europe/London";

function localTimeIn(tz: string): { hour: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    weekday: "short",
    hour12: false,
    timeZone: tz,
  });
  const parts = fmt.formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { hour, day: dayMap[weekday] ?? -1 };
}

export async function runWeeklyDigestJob(): Promise<void> {
  if (!process.env.DISCORD_WEBHOOK_ANNOUNCEMENTS) return;

  const { hour, day } = localTimeIn(POST_TZ);
  if (day !== POST_DAY_LOCAL || hour !== POST_HOUR_LOCAL) return;

  // Dedup: already posted this week? Use a 6-day floor — if we
  // posted within the last 6 days we don't post again. Day-of-week
  // gate above stops us posting more than once per Sunday.
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const alreadyThisWeek = await prisma.appEvent.findFirst({
    where: { type: APP_EVENT_TYPE, createdAt: { gte: sixDaysAgo } },
    select: { id: true },
  });
  if (alreadyThisWeek) return;

  const digest = await buildWeeklyDigest();

  // Build the embed. Fields are inline-paired for a tight layout.
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "🛣️ Business miles",
      value: formatMiles(digest.totalBusinessMiles),
      inline: true,
    },
    {
      name: "💷 Mileage deduction",
      value: formatPence(digest.totalMileageDeductionPence),
      inline: true,
    },
    {
      name: "🧭 Trips tracked",
      value: digest.totalTripsTracked.toString(),
      inline: true,
    },
    {
      name: "🧑‍✈️ Active drivers",
      value: digest.activeDriverCount.toString(),
      inline: true,
    },
    {
      name: "👋 New this week",
      value: digest.newDriverCount.toString(),
      inline: true,
    },
  ];

  if (digest.topPlatforms.length > 0) {
    fields.push({
      name: "🏆 Top platforms",
      value: digest.topPlatforms
        .map((p) => `${PLATFORM_DISPLAY[p.platform] ?? p.platform}: ${p.tripPct}%`)
        .join(" · "),
      inline: false,
    });
  }

  const milestoneLines: string[] = [];
  if (digest.milestones.crossed10kMiles > 0) {
    milestoneLines.push(
      `🎯 ${digest.milestones.crossed10kMiles} crossed 10,000 business miles`
    );
  }
  if (digest.milestones.crossed5kMiles > 0) {
    milestoneLines.push(
      `🎯 ${digest.milestones.crossed5kMiles} crossed 5,000 business miles`
    );
  }
  if (digest.milestones.crossed1kMiles > 0) {
    milestoneLines.push(
      `🎯 ${digest.milestones.crossed1kMiles} crossed 1,000 business miles`
    );
  }
  if (digest.milestones.firstTripEver > 0) {
    milestoneLines.push(
      `🆕 ${digest.milestones.firstTripEver} logged their first MileClear trip`
    );
  }
  if (milestoneLines.length > 0) {
    fields.push({
      name: "Milestones",
      value: milestoneLines.join("\n"),
      inline: false,
    });
  }

  const posted = await postToChannel("announcements", {
    embeds: [
      {
        title: "📈 This week in MileClear",
        description: digest.highlight,
        color: 0xfbbf24,
        fields,
        footer: { text: "MileClear community — open the app for your own numbers" },
        timestamp: new Date().toISOString(),
      },
    ],
    suppressMentions: true,
  });

  if (!posted) {
    console.warn("[weeklyDigest] post failed");
    return;
  }

  await prisma.appEvent.create({
    data: {
      type: APP_EVENT_TYPE,
      userId: null,
      metadata: {
        activeDriverCount: digest.activeDriverCount,
        totalBusinessMiles: digest.totalBusinessMiles,
        totalMileageDeductionPence: digest.totalMileageDeductionPence,
        newDriverCount: digest.newDriverCount,
        topPlatforms: digest.topPlatforms.map((p) => p.platform),
      },
    },
  });

  console.log(
    `[weeklyDigest] posted: ${digest.activeDriverCount} active, ${digest.totalTripsTracked} trips, ${formatMiles(digest.totalBusinessMiles)}`
  );
}

// Display labels kept in this file so the digest message doesn't
// depend on the shared constants module's exact platform string set.
const PLATFORM_DISPLAY: Record<string, string> = {
  uber: "Uber",
  deliveroo: "Deliveroo",
  just_eat: "Just Eat",
  amazon_flex: "Amazon Flex",
  stuart: "Stuart",
  gophr: "Gophr",
  dpd: "DPD",
  yodel: "Yodel",
  evri: "Evri",
  freelance: "Freelance",
  other: "Other",
};
