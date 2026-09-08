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
//
// Day 1 and day 3 added 8 Sep 2026, and the push-token filter dropped from
// all three. 275 of 1,009 registered users had never recorded a trip, and
// the push-only jobs could not reach the two groups that made up most of
// them: web signups who never installed the app, and app installs whose
// token only reaches the server on the second cold start. Each nudge now
// names the one thing in the way (see activationBlocker.ts) and falls back
// to email when there is no token.

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { logEvent } from "../services/appEvents.js";
import { postFounderAlert } from "../services/discord.js";
import { sendActivationNudgeEmail } from "../services/email.js";
import { resolvePremiumStatus } from "../services/referral.js";
import { classifyProSource, loadSandboxTxnIds } from "../services/subscriptionTruth.js";
import { classifyActivationBlocker, type ActivationBlocker } from "./activationBlocker.js";

export { classifyActivationBlocker, type ActivationBlocker } from "./activationBlocker.js";

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

// ── Activation nudges: day 1, day 3, day 7 ───────────────────────────────

export type ActivationNudgeDay = 1 | 3 | 7;
export type ActivationNudgeChannel = "push" | "email" | "none";

export interface ActivationNudgeCandidate {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  blocker: Exclude<ActivationBlocker, "none">;
  channel: ActivationNudgeChannel;
  pushToken: string | null;
}

// Account-age windows in hours. Wider than the 30-minute tick so a missed
// tick (restart, window edge) still catches everyone once.
const NUDGE_WINDOW_HOURS: Record<ActivationNudgeDay, [number, number]> = {
  1: [20, 44],
  3: [68, 92],
  7: [6 * 24, 9 * 24],
};

const pushEvent = (day: ActivationNudgeDay) => `notification.activation_d${day}`;
const emailEvent = (day: ActivationNudgeDay) => `email.activation_d${day}`;

/**
 * Everyone this day's nudge would reach right now, with the blocker and the
 * channel it would use. Shared by the job and the rehearsal script; the
 * only side effects are reads.
 */
export async function previewActivationEarlyNudges(day: ActivationNudgeDay): Promise<ActivationNudgeCandidate[]> {
  const now = new Date();
  const [minHours, maxHours] = NUDGE_WINDOW_HOURS[day];
  const users = await prisma.user.findMany({
    where: {
      createdAt: {
        gte: new Date(now.getTime() - maxHours * 3_600_000),
        lte: new Date(now.getTime() - minHours * 3_600_000),
      },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      pushToken: true,
      emailVerified: true,
      marketingEmailsEnabled: true,
      signupPlatform: true,
      platformsSeen: true,
      lastHeartbeatAt: true,
      bgLocationPermission: true,
    },
    take: 200,
  });
  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);

  const [tripCounts, dumps, history] = await Promise.all([
    prisma.trip.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, isPhantomTrip: false },
      _count: { _all: true },
    }),
    prisma.diagnosticDump.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, capturedAt: true, statusJson: true },
    }),
    prisma.appEvent.findMany({
      where: { userId: { in: ids }, type: { in: [pushEvent(day), emailEvent(day)] } },
      select: { userId: true },
    }),
  ]);
  const tripsBy = new Map(tripCounts.map((t) => [t.userId, t._count._all]));
  const dumpBy = new Map(
    dumps.map((d) => [
      d.userId,
      {
        capturedAt: d.capturedAt,
        backgroundPermission: (d.statusJson as { backgroundPermission?: unknown } | null)?.backgroundPermission,
      },
    ])
  );
  const notified = new Set(history.map((h) => h.userId));

  const out: ActivationNudgeCandidate[] = [];
  for (const u of users) {
    if (notified.has(u.id)) continue;
    const blocker = classifyActivationBlocker({
      tripCount: tripsBy.get(u.id) ?? 0,
      lastHeartbeatAt: u.lastHeartbeatAt,
      signupPlatform: u.signupPlatform,
      platformsSeen: u.platformsSeen,
      bgLocationPermission: u.bgLocationPermission,
      pushToken: u.pushToken,
      dump: dumpBy.get(u.id) ?? null,
    });
    if (blocker === "none") continue;
    const channel: ActivationNudgeChannel = u.pushToken
      ? "push"
      : u.emailVerified && u.marketingEmailsEnabled
        ? "email"
        : "none";
    out.push({
      userId: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      blocker,
      channel,
      pushToken: u.pushToken,
    });
  }
  return out;
}

function pushForBlocker(
  day: ActivationNudgeDay,
  blocker: Exclude<ActivationBlocker, "none">,
  to: string
): ExpoPushMessage {
  const type = `activation_d${day}`;
  if (blocker === "no_permission") {
    return {
      to,
      title: "One switch and MileClear starts working",
      body: "MileClear can't record your drives yet because it can't see your location in the background. Tap to open Settings, then Location, and choose Always. After that it runs by itself.",
      sound: "default",
      // open_settings lands on MileClear's own iOS settings page, where the
      // Location row lives.
      data: { type, action: "open_settings" },
    };
  }
  // web_only with a push token cannot happen (the token proves an install),
  // so anything left is no_drive_yet: the low-effort path, a past drive.
  if (day === 7) {
    return {
      to,
      title: "Two minutes to your first mile",
      body: "Add a drive you've already done, it takes seconds, and every business mile counts at 55p towards your tax deduction. Or turn on Always location and MileClear records the next one by itself.",
      sound: "default",
      data: { type, action: "open_dashboard" },
    };
  }
  return {
    to,
    title: day === 1 ? "Your first mile" : "Still no drives recorded",
    body:
      day === 1
        ? "Location is set up, so your next drive records by itself. Done one already? Add it from the dashboard in a few seconds, and every business mile counts at 55p towards your tax deduction."
        : "MileClear is ready but nothing has been recorded yet. Add a drive you've already done from the dashboard, or just drive with your phone in the car and it records the next one.",
    sound: "default",
    data: { type, action: "open_dashboard" },
  };
}

async function runActivationNudge(day: ActivationNudgeDay): Promise<void> {
  const now = new Date();
  // ACTIVATION_EARLY_DRY_RUN=1 prints who would get what, sends nothing on
  // either channel, and ignores the window so it can be run on demand.
  // Covers day 7 too, since day 7 now emails as well as pushes.
  const dryRun = process.env.ACTIVATION_EARLY_DRY_RUN === "1";
  if (!dryRun && !inNudgeWindow(now)) return;

  const candidates = await previewActivationEarlyNudges(day);
  if (candidates.length === 0) return;

  const messages: ExpoPushMessage[] = [];
  let emailed = 0;
  for (const c of candidates) {
    if (c.channel === "none") continue;
    if (dryRun) {
      console.log(`[jobs/activation] DRY RUN day-${day} would ${c.channel} ${c.userId} (blocker=${c.blocker})`);
      continue;
    }
    if (c.channel === "push") {
      if (!c.pushToken) continue;
      logEvent(pushEvent(day), c.userId, { blocker: c.blocker });
      messages.push(pushForBlocker(day, c.blocker, c.pushToken));
      continue;
    }
    try {
      await sendActivationNudgeEmail(c.email, c.displayName, { reason: c.blocker }, c.userId);
      logEvent(emailEvent(day), c.userId, { blocker: c.blocker });
      emailed += 1;
      // Small delay between emails, as the check-in job does.
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`[jobs/activation] Day-${day} email failed for ${c.userId}:`, err);
    }
  }

  if (dryRun) {
    console.log(
      `[jobs/activation] DRY RUN day-${day} complete: ${candidates.length} candidates, ${candidates.filter((c) => c.channel === "none").length} unreachable, 0 sent`
    );
    return;
  }
  if (messages.length > 0) await sendPushNotifications(messages);
  if (messages.length > 0 || emailed > 0) {
    console.log(`[jobs/activation] Day-${day} nudge: sent ${messages.length} push(es), ${emailed} email(s)`);
  }
}

export async function runActivationEarlyNudgeJob(day: 1 | 3): Promise<void> {
  await runActivationNudge(day);
}

export async function runActivationDay7Job(): Promise<void> {
  await runActivationNudge(7);
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
      bgLocationPermission: true,
      _count: { select: { trips: true } },
    },
    take: 300,
  });
  if (candidates.length === 0) return;

  const heartbeatById = new Map(candidates.map((c) => [c.id, c.lastHeartbeatAt]));
  const candidateIds = candidates.map((c) => c.id);

  // "undetermined" is not proof. On iPhone expo-location reports it for
  // While Using as well as for never-asked, and a While Using driver who
  // opens the app before setting off captures fine (2 Sep 2026: the four
  // most valuable "undetermined" accounts in the fleet had each captured
  // auto trips that day). For someone who has captured before, the reading
  // only counts if their captures STOPPED when it appeared: the daily
  // alert.heartbeat_bg_location_lost event is the first dated record of the
  // reading, so an auto trip captured after that first alert means this
  // phone records under this reading and the message would be false. No
  // alert on file means no evidence either way, which is also a skip.
  // "denied" is a real refusal and needs no corroboration.
  const [lastAutoTrips, firstLostAlerts] = await Promise.all([
    prisma.trip.groupBy({
      by: ["userId"],
      where: { userId: { in: candidateIds }, isManualEntry: false, isPhantomTrip: false },
      _max: { startedAt: true },
    }),
    prisma.appEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: candidateIds }, type: "alert.heartbeat_bg_location_lost" },
      _min: { createdAt: true },
    }),
  ]);
  const lastAutoTripBy = new Map(lastAutoTrips.map((t) => [t.userId, t._max.startedAt]));
  const firstLostAlertBy = new Map(firstLostAlerts.map((a) => [a.userId!, a._min.createdAt]));
  const readingUnproven = (user: { id: string; bgLocationPermission: string | null }): boolean => {
    if (user.bgLocationPermission === "denied") return false;
    const lastAuto = lastAutoTripBy.get(user.id);
    if (!lastAuto) return false; // never captured: the reading is consistent with the outcome
    const firstLost = firstLostAlertBy.get(user.id);
    return !firstLost || lastAuto > firstLost;
  };

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
    if (readingUnproven(user)) {
      if (dryRun) console.log(`[jobs/activation] DRY RUN skip ${user.id}: captured under this permission reading before`);
      continue;
    }
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

// Short-hop drivers without saved locations (23 Aug 2026, copy corrected
// 8 Sep 2026).
//
// The engine records plenty of short trips - 497 auto-captured at 0.3-0.5 mi
// in the month to 23 Aug - but it cannot ARM in time for a sixty-second
// drive when it has to wait for CoreMotion's "automotive" verdict, so the
// manual share climbs as trips shorten: 3% of 2+ mile trips are typed in,
// 34% of 0.3-0.5 mile ones. Of 148 users doing five or more sub-mile trips
// a month, 29 had a saved location.
//
// What a saved location actually does, and what this message may claim:
// saved locations have NOT been geofences since 17 May 2026, so nothing
// fires when the phone leaves one and they do not make a short hop record
// any sooner. What they do is name the stops on the trip list and let the
// app tell regular places apart, which is worth most to exactly the people
// making lots of short trips between the same few places. The first version
// of this push promised capture "the moment you leave"; that was false.
const SHORT_HOP_WINDOW_DAYS = 30;
const SHORT_HOP_MIN_TRIPS = 5;
const SHORT_HOP_MAX_MILES = 1;
const SHORT_HOP_COOLDOWN_DAYS = 60;
const SHORT_HOP_MAX_SENDS = 2;

export async function runShortHopSavedLocationsJob(): Promise<void> {
  const now = new Date();
  // SHORT_HOP_NUDGE_DRY_RUN=1 prints who would be pushed, sends nothing, and
  // ignores the window so it can be run on demand.
  const dryRun = process.env.SHORT_HOP_NUDGE_DRY_RUN === "1";
  if (!dryRun && !inNudgeWindow(now)) return;

  const since = new Date(now.getTime() - SHORT_HOP_WINDOW_DAYS * 86_400_000);
  const aliveCutoff = new Date(now.getTime() - 14 * 86_400_000);
  const cooldownCutoff = new Date(now.getTime() - SHORT_HOP_COOLDOWN_DAYS * 86_400_000);

  const counts = await prisma.trip.groupBy({
    by: ["userId"],
    where: { startedAt: { gte: since }, distanceMiles: { lt: SHORT_HOP_MAX_MILES } },
    _count: { _all: true },
    _sum: { distanceMiles: true },
    having: { userId: { _count: { gte: SHORT_HOP_MIN_TRIPS } } },
  });
  if (counts.length === 0) return;
  const shortTripsBy = new Map(counts.map((c) => [c.userId, c._count._all]));

  const candidates = await prisma.user.findMany({
    where: {
      id: { in: [...shortTripsBy.keys()] },
      lastHeartbeatAt: { gte: aliveCutoff },
      pushToken: { not: null },
      // The whole point: none of their regular stops has a name yet.
      savedLocations: { none: {} },
    },
    select: { id: true, pushToken: true },
    take: 300,
  });
  if (candidates.length === 0) return;

  const history = await prisma.appEvent.findMany({
    where: {
      type: "notification.short_hop_saved_locations",
      userId: { in: candidates.map((c) => c.id) },
    },
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
  let examined = 0;
  for (const user of candidates) {
    examined += 1;
    const seen = sends.get(user.id);
    if (seen && seen.count >= SHORT_HOP_MAX_SENDS) continue;
    if (seen && seen.last > cooldownCutoff) continue;
    const n = shortTripsBy.get(user.id) ?? 0;

    const body = `You made ${n} short trips last month. Save home and your regular stops in MileClear (Settings, then Tracking, then Saved locations) so each one is named on your trip list and the app can tell your regular places apart.`;

    if (dryRun) {
      console.log(
        `[jobs/activation] DRY RUN short-hop nudge would push ${user.id} (shortTrips=${n}, sendNumber=${(seen?.count ?? 0) + 1})`
      );
      continue;
    }
    logEvent("notification.short_hop_saved_locations", user.id, {
      shortTrips: n,
      sendNumber: (seen?.count ?? 0) + 1,
    });
    messages.push({
      to: user.pushToken!,
      title: "Name the places you keep driving between",
      body,
      sound: "default",
      // open_saved_locations lands on the Saved Locations screen from build
      // 85; earlier builds fall through to opening the app, and the body
      // spells out the path.
      data: { type: "short_hop_saved_locations", action: "open_saved_locations" },
    });
  }

  if (dryRun) {
    console.log(
      `[jobs/activation] DRY RUN complete: ${counts.length} short-hop drivers, ${candidates.length} reachable with no saved location, ${examined} examined, 0 sent`
    );
    return;
  }
  if (messages.length > 0) {
    await sendPushNotifications(messages);
    console.log(`[jobs/activation] Short-hop saved-locations nudge: sent ${messages.length} push(es)`);
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
