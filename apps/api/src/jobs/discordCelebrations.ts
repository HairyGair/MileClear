// Driver milestone celebrations posted to #wins.
//
// Two separate sweeps share this file:
//   1. First-trip-ever — when a Discord-linked driver records their
//      very first business trip
//   2. Mileage milestones — when a Discord-linked driver crosses
//      1k / 5k / 10k / 25k business miles
//
// Posts are anonymised by default — "A driver hit 5,000 miles 🎯" not
// "@Anthony hit 5k". Linking Discord is opt-in but using real names
// in a public channel would still feel surveillance-y for users who
// haven't explicitly consented to that. Worth revisiting later with
// an opt-in toggle on the linking flow.
//
// Phase 2 of the Discord roadmap (21 May 2026).

import { prisma } from "../lib/prisma.js";
import { postToChannel } from "../services/discord.js";
import { formatPence } from "@mileclear/shared";

const APP_EVENT_FIRST_TRIP = "discord.first_trip_celebrated";
const APP_EVENT_MILESTONE = "discord.mileage_milestone_celebrated";

// Mileage thresholds to celebrate. Pence-per-mile (45p first 10k, 25p
// after) so we can mention real savings in the post copy.
const MILESTONES_PENCE = [
  { miles: 1000, label: "1,000", deductionPence: 45_000 },
  { miles: 5000, label: "5,000", deductionPence: 225_000 },
  { miles: 10000, label: "10,000", deductionPence: 450_000 },
  { miles: 25000, label: "25,000", deductionPence: 825_000 }, // 10k×45 + 15k×25
] as const;

// ── First-trip celebration ──────────────────────────────────────────

export async function runFirstTripCelebrationJob(): Promise<void> {
  if (!process.env.DISCORD_WEBHOOK_WINS) return;

  // Look at trips logged in the last 6 hours — matches the cron
  // cadence so we catch them once.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  // Find linked users with at least one classified business trip
  // in the window. We then check per-user whether this is their
  // first business trip ever.
  const linkedUsersWithRecent = await prisma.user.findMany({
    where: {
      discordUserId: { not: null },
      trips: {
        some: {
          startedAt: { gte: sixHoursAgo },
          isPhantomTrip: false,
          classification: "business",
        },
      },
    },
    select: { id: true, discordUserId: true },
  });

  for (const user of linkedUsersWithRecent) {
    // Has anything earlier? If so, this isn't their first ever.
    const earlier = await prisma.trip.findFirst({
      where: {
        userId: user.id,
        startedAt: { lt: sixHoursAgo },
        isPhantomTrip: false,
        classification: "business",
      },
      select: { id: true },
    });
    if (earlier) continue;

    // Dedup — already celebrated?
    const alreadyCelebrated = await prisma.appEvent.findFirst({
      where: { type: APP_EVENT_FIRST_TRIP, userId: user.id },
      select: { id: true },
    });
    if (alreadyCelebrated) continue;

    const posted = await postToChannel("wins", {
      embeds: [
        {
          title: "🎉 First trip on MileClear",
          description:
            "A new driver just logged their first business trip on MileClear. Welcome to the community — every mile from here is deductible.",
          color: 0x10b981,
          footer: { text: "MileClear · driver milestone" },
          timestamp: new Date().toISOString(),
        },
      ],
      suppressMentions: true,
    });

    if (posted) {
      await prisma.appEvent.create({
        data: {
          type: APP_EVENT_FIRST_TRIP,
          userId: user.id,
          metadata: { discordUserId: user.discordUserId },
        },
      });
      console.log(`[firstTripCelebration] posted for user ${user.id}`);
    }
  }
}

// ── Mileage milestone celebration ────────────────────────────────

export async function runMileageMilestoneCelebrationJob(): Promise<void> {
  if (!process.env.DISCORD_WEBHOOK_WINS) return;

  // For each Discord-linked user, compare their CURRENT business
  // mileage YTD against 24h ago. If they crossed a milestone in
  // that window, post.
  //
  // We approximate by reading the mileage summary (live YTD) and
  // subtracting the last 24h of business trips — same heuristic
  // used by the community digest.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const linked = await prisma.user.findMany({
    where: { discordUserId: { not: null } },
    select: { id: true },
  });
  if (linked.length === 0) return;

  for (const u of linked) {
    const summary = await prisma.mileageSummary.findFirst({
      where: { userId: u.id },
      select: { businessMiles: true },
      orderBy: { taxYear: "desc" },
    });
    if (!summary) continue;
    const totalNow = summary.businessMiles;

    const recent = await prisma.trip.aggregate({
      where: {
        userId: u.id,
        startedAt: { gte: oneDayAgo },
        isPhantomTrip: false,
        classification: "business",
      },
      _sum: { distanceMiles: true },
    });
    const recentMiles = recent._sum.distanceMiles ?? 0;
    const totalThen = totalNow - recentMiles;

    for (const milestone of MILESTONES_PENCE) {
      if (totalThen >= milestone.miles) continue; // already past
      if (totalNow < milestone.miles) continue; // not yet
      // They crossed it in the last 24h.

      const dedupKey = `${u.id}:${milestone.miles}`;
      const already = await prisma.appEvent.findMany({
        where: {
          type: APP_EVENT_MILESTONE,
          userId: u.id,
        },
        select: { metadata: true },
      });
      const matched = already.some((r) => {
        const meta = r.metadata as { dedupKey?: string } | null;
        return meta?.dedupKey === dedupKey;
      });
      if (matched) continue;

      const posted = await postToChannel("wins", {
        embeds: [
          {
            title: `🎯 ${milestone.label} business miles!`,
            description: `A driver just crossed **${milestone.label} business miles** this tax year. That's **${formatPence(milestone.deductionPence)}** of tax deduction unlocked at HMRC's AMAP rates.`,
            color: 0xfbbf24,
            footer: { text: "MileClear · driver milestone" },
            timestamp: new Date().toISOString(),
          },
        ],
        suppressMentions: true,
      });

      if (posted) {
        await prisma.appEvent.create({
          data: {
            type: APP_EVENT_MILESTONE,
            userId: u.id,
            metadata: { dedupKey, milestone: milestone.miles },
          },
        });
        console.log(
          `[milestoneCelebration] posted ${milestone.miles}-mile cross for user ${u.id}`
        );
        // Only celebrate one milestone per user per run — if they
        // crossed two thresholds in one day (rare), the next run
        // gets the next one.
        break;
      }
    }
  }
}
