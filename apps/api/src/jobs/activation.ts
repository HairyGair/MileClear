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
import { classifyProSource, loadSandboxTxnIds } from "../services/subscriptionTruth.js";

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

// ── Capture-lapsed nudge (18 Aug 2026) ───────────────────────────────────
//
// The hole this fills, found by auditing why Rakesh Patel sat for 17 days with
// one trip to his name: 25% of the active fleet cannot capture in the
// background, and 45 users were running the app with NOTHING recorded in 14
// days — 33 of whom had never recorded anything at all. Every existing safety
// net missed them:
//
//   - the in-app "Always" prompt only fires AFTER a trip is saved through the
//     form, so it is gated on the very thing it exists to fix;
//   - the dashboard's persistent blocker only appears at permission tier
//     "none", while a "foreground" user who never drives with the app open
//     records exactly as much as a "none" user, and gets a dismissible nudge;
//   - runActivationDay7Job below fires once, in a 6-9 day window, and skips
//     anyone with tripCount > 0 — so a single day-one trip grants lifetime
//     immunity from the only server-side prompt there was.
//
// None of it showed up in the numbers, because fleet trip volume rose the whole
// time (roughly 400/day in late July to 700/day by mid-August). Total
// individual failures are invisible inside a growing total.
//
// THE QUALIFIER THAT MAKES THIS SAFE TO SEND: background permission is not
// granted. Without it this job would push everyone who happened not to drive
// for a fortnight, which is most of a holiday season. With it, we are only
// telling people something true and specific: the app cannot see your drives,
// and here is the switch.
const LAPSED_TRIP_SILENCE_DAYS = 14;
const LAPSED_COOLDOWN_DAYS = 30;
const LAPSED_MAX_SENDS = 3;

export async function runCaptureLapsedJob(): Promise<void> {
  const now = new Date();
  // ACTIVATION_LAPSED_DRY_RUN=1 logs who WOULD be pushed and sends nothing,
  // and skips the time window so it can be run on demand. Mirrors
  // INVOICE_CHASE_DRY_RUN. Use it before letting this loose on real people.
  const dryRun = process.env.ACTIVATION_LAPSED_DRY_RUN === "1";
  if (!dryRun && !inNudgeWindow(now)) return;

  const tripCutoff = new Date(now.getTime() - LAPSED_TRIP_SILENCE_DAYS * 86_400_000);
  const aliveCutoff = new Date(now.getTime() - 14 * 86_400_000);
  const cooldownCutoff = new Date(now.getTime() - LAPSED_COOLDOWN_DAYS * 86_400_000);

  const candidates = await prisma.user.findMany({
    where: {
      // Still using the app — a dead install is a churn problem, not this one.
      lastHeartbeatAt: { gte: aliveCutoff },
      pushToken: { not: null },
      // The app cannot record in the background for them. This is the whole
      // basis of the message, so it is a hard filter, not a ranking signal.
      OR: [{ bgLocationPermission: null }, { bgLocationPermission: { not: "granted" } }],
      // Nothing captured in the silence window.
      trips: { none: { startedAt: { gte: tripCutoff } } },
      // Give the day-7 job its own run at brand-new accounts first.
      createdAt: { lte: new Date(now.getTime() - 9 * 86_400_000) },
    },
    select: {
      id: true,
      pushToken: true,
      lastHeartbeatAt: true,
      _count: { select: { trips: true } },
    },
    take: 300,
  });
  if (candidates.length === 0) return;

  const heartbeatById = new Map(candidates.map((c) => [c.id, c.lastHeartbeatAt]));

  // The permission reading above comes from the last HEARTBEAT, which can be
  // stale by hours - and the gap is exactly when someone has just fixed it.
  // Rakesh Patel granted Always at 10:04 on 18 Aug after 17 dark days; his
  // heartbeat still said "undetermined", so the first dry run of this job had
  // it telling him to go and do the thing he had done two hours earlier. The
  // diagnostic dump carries its own, often fresher, permission snapshot (the
  // same disagreement that made Isla Hignett's case readable the day before),
  // so where the dump is newer than the heartbeat, believe the dump.
  const dumps = await prisma.diagnosticDump.findMany({
    where: { userId: { in: candidates.map((c) => c.id) } },
    select: { userId: true, capturedAt: true, statusJson: true },
  });
  const fixedSinceHeartbeat = new Set<string>();
  for (const d of dumps) {
    const status = d.statusJson as { backgroundPermission?: unknown } | null;
    if (status?.backgroundPermission !== "granted") continue;
    const hb = heartbeatById.get(d.userId);
    if (hb && d.capturedAt > hb) fixedSinceHeartbeat.add(d.userId);
  }

  // One query for the send history of every candidate, rather than two per
  // user: this job runs every 30 minutes inside its window.
  const history = await prisma.appEvent.findMany({
    where: { type: "notification.capture_lapsed", userId: { in: candidates.map((c) => c.id) } },
    select: { userId: true, createdAt: true },
  });
  const sends = new Map<string, { count: number; last: Date }>();
  for (const h of history) {
    if (!h.userId) continue;
    const prev = sends.get(h.userId);
    if (!prev) sends.set(h.userId, { count: 1, last: h.createdAt });
    else sends.set(h.userId, { count: prev.count + 1, last: h.createdAt > prev.last ? h.createdAt : prev.last });
  }

  const messages: ExpoPushMessage[] = [];
  for (const user of candidates) {
    if (fixedSinceHeartbeat.has(user.id)) continue;
    const seen = sends.get(user.id);
    if (seen && seen.count >= LAPSED_MAX_SENDS) continue;
    if (seen && seen.last > cooldownCutoff) continue;

    // Two populations, two truths. Someone who has recorded before knows what
    // they are missing; someone who never has needs telling what it is for.
    const everCaptured = user._count.trips > 0;
    const body = everCaptured
      ? "MileClear hasn't recorded a drive in a fortnight because it can't see your location in the background. Tap to open Settings, then Location, and choose Always."
      : "MileClear can't record your drives yet because it can't see your location in the background. Tap to open Settings, then Location, and choose Always. It takes a moment and then it runs by itself.";

    if (dryRun) {
      console.log(
        `[jobs/activation] DRY RUN would push ${user.id} (everCaptured=${everCaptured}, trips=${user._count.trips}, sendNumber=${(seen?.count ?? 0) + 1})`
      );
      continue;
    }
    logEvent("notification.capture_lapsed", user.id, {
      everCaptured,
      sendNumber: (seen?.count ?? 0) + 1,
    });
    messages.push({
      to: user.pushToken!,
      title: everCaptured ? "Your drives aren't being recorded" : "One switch and MileClear starts working",
      body,
      sound: "default",
      // open_settings routes to Linking.openSettings(), which lands them on
      // MileClear's own iOS settings page where the Location row lives.
      data: { type: "capture_lapsed", action: "open_settings" },
    });
  }

  if (dryRun) {
    console.log(`[jobs/activation] DRY RUN complete: ${candidates.length} candidates examined, 0 sent`);
    return;
  }
  if (messages.length > 0) {
    await sendPushNotifications(messages);
    console.log(`[jobs/activation] Capture-lapsed nudge: sent ${messages.length} push(es)`);
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
      stripeSubscriptionId: true,
      appleOriginalTransactionId: true,
      _count: { select: { trips: true, invoices: true, earnings: true } },
    },
    take: 500,
  });

  // "Paying user" means paying. The alarm fired on 21 Aug 2026 for App
  // Review's sandbox subscription (a reviewer account that will never
  // drive), and would fire for comp grants and referral credit too. Only a
  // Stripe or production-Apple subscriber is worth a personal email.
  const sandboxTxns = await loadSandboxTxnIds();

  for (const user of candidates) {
    if (!resolvePremiumStatus(user).active) continue;
    if (classifyProSource(user, sandboxTxns, now) !== "paying") continue;
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
