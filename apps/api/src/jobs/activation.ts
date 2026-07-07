// Activation escalation jobs (8 Jul 2026).
//
// The funnel's biggest hole: 36.5% of signups never log a single trip.
// Days 1-4 already have touchpoints (welcome push, day-3 check-in
// email). After that, silence forever — so these add:
//
//   Day 7 push — one final, honest nudge with the LOW-EFFORT path
//   front and centre (add a past drive manually). Comms rarely revive
//   the fully-cold, but day 7 is still warm.
//
//   Paying-but-inactive alarm — a Pro subscriber with zero trips is
//   both the highest-value save AND invisible until they cancel (JRD
//   Electrical paid for weeks, tracked nothing, then churned; we found
//   out from the cancellation webhook). One push to the user + one
//   #founder alert so a human can reach out while there's still a
//   relationship to save.
//
// Both once-ever per user (AppEvent dedup), gated to a sane send hour.

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { logEvent } from "../services/appEvents.js";
import { postFounderAlert } from "../services/discord.js";
import { resolvePremiumStatus } from "../services/referral.js";

async function wasEverNotified(userId: string, eventType: string): Promise<boolean> {
  const existing = await prisma.appEvent.findFirst({
    where: { type: eventType, userId },
    select: { id: true },
  });
  return existing !== null;
}

/** 16:00-18:00 UTC — early evening, after the working day. */
function inNudgeWindow(now: Date): boolean {
  const h = now.getUTCHours();
  return h >= 16 && h < 18;
}

export async function runActivationDay7Job(): Promise<void> {
  const now = new Date();
  if (!inNudgeWindow(now)) return;

  const nineDaysAgo = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000);
  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: {
      createdAt: { gte: nineDaysAgo, lte: sixDaysAgo },
      pushToken: { not: null },
    },
    select: { id: true, pushToken: true },
    take: 200,
  });

  const messages: ExpoPushMessage[] = [];
  for (const user of candidates) {
    if (await wasEverNotified(user.id, "notification.activation_d7")) continue;
    const tripCount = await prisma.trip.count({
      where: { userId: user.id, isPhantomTrip: false },
    });
    if (tripCount > 0) continue;

    logEvent("notification.activation_d7", user.id);
    messages.push({
      to: user.pushToken!,
      title: "Two minutes to your first mile",
      body: "Add a drive you've already done — it takes seconds, and every business mile is worth 55p off your tax bill. Or turn on Always location and MileClear records the next one by itself.",
      sound: "default",
      data: { type: "activation_d7", action: "open_dashboard" },
    });
  }

  if (messages.length > 0) {
    await sendPushNotifications(messages);
    console.log(`[jobs/activation] Day-7 nudge: sent ${messages.length} push(es)`);
  }
}

export async function runPayingInactiveAlarmJob(): Promise<void> {
  const now = new Date();
  if (!inNudgeWindow(now)) return;

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Effective-premium users with week-old accounts. resolvePremiumStatus
  // re-verified per user below (referral credit counts too — a free month
  // someone earned and never used is the same warning sign).
  const candidates = await prisma.user.findMany({
    where: {
      createdAt: { lte: sevenDaysAgo },
      OR: [{ isPremium: true }, { referralProUntil: { gte: now } }],
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      pushToken: true,
      isPremium: true,
      premiumExpiresAt: true,
      referralProUntil: true,
      _count: { select: { trips: true, invoices: true, earnings: true } },
    },
    take: 500,
  });

  for (const user of candidates) {
    if (!resolvePremiumStatus(user).active) continue;
    // "Inactive" = paying and using NOTHING. Any trips, invoices or
    // earnings mean they've found their value path — leave them alone.
    if (user._count.trips > 0 || user._count.invoices > 0 || user._count.earnings > 0) continue;
    if (await wasEverNotified(user.id, "notification.pro_inactive")) continue;

    logEvent("notification.pro_inactive", user.id, {
      email: user.email,
      accountAgeDays: Math.round((now.getTime() - user.createdAt.getTime()) / 86_400_000),
    });

    if (user.pushToken) {
      await sendPushNotifications([
        {
          to: user.pushToken,
          title: "Let's get you set up properly",
          body: "You're on MileClear Pro but haven't tracked anything yet — that's on us to fix. Open the app for a 2-minute setup, or reply to any of our emails and a real person will help.",
          sound: "default",
          data: { type: "pro_inactive", action: "open_dashboard" },
        },
      ]);
    }

    // The human escalation — a paying user drifting toward silent churn
    // is worth a personal email from Anthony (automated win-backs
    // convert ~nothing; see JRD Electrical).
    await postFounderAlert({
      severity: "warning",
      title: "Paying user has never activated",
      detail: `${user.displayName ?? user.email} (${user.email}) — Pro, joined ${user.createdAt.toISOString().slice(0, 10)}, zero trips/invoices/earnings. Worth a personal email before they churn like JRD Electrical.`,
      userId: user.id,
    });
  }
}
