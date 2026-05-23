// Server-side recording watchdog
//
// Backstops the iOS-suspended-JS failure mode. The mobile detection.ts has
// its own setInterval watchdog, but iOS suspends the JavaScript runtime in
// the background — so when a recording gets stuck (phantom geofence exit,
// indoor GPS drift, app crash mid-trip), the on-device watchdog can sit
// suspended for hours. James reported exactly this on 2 May 2026 (his
// Live Activity sat at "0 mi · 35m" for hours).
//
// What this does:
//   1. Cron runs every 5 minutes.
//   2. Finds users where autoRecordingActive=true AND lastDrivingSpeedAt is
//      more than STUCK_THRESHOLD_MS old in their heartbeat.
//   3. Sends a silent push to that user's device tokens. content-available
//      wakes the JS runtime briefly even when the app is fully suspended.
//   4. Mobile push handler (lib/notifications/index.ts) receives, runs
//      finalizeStaleAutoRecordings(), and the stuck recording drains.
//
// Constraints:
//   - iOS limits silent pushes to ~3/hour per app per device. We stay well
//     under that by gating with COOLDOWN_MS.
//   - Silent-push delivery is ~80% reliable in deep iOS suspension. Worse
//     than active push but better than letting the recording sit forever.
//   - We rely on heartbeat freshness — only users who have sent a heartbeat
//     within HEARTBEAT_FRESHNESS_MS will be checked, otherwise we don't
//     have reliable data on whether the recording is genuinely stuck.

import { prisma } from "../lib/prisma.js";
import { sendPushNotification } from "../lib/push.js";
import { logEvent } from "../services/appEvents.js";
import { postFounderAlert } from "../services/discord.js";

// Recording is "stuck" if no driving speed seen for more than this.
// Generous on purpose - a user genuinely stopped at lights, in a tunnel,
// or in heavy traffic could legitimately go 10-15 min without driving
// speed. 30 minutes lets normal pauses through but catches truly stuck
// recordings reliably.
const STUCK_THRESHOLD_MS = 30 * 60 * 1000;

// Don't ping the same user more than once per 30 minutes. Prevents the
// silent-push budget from being burned on a user whose device is just
// not responding (genuinely offline). Shared across the stuck-recording
// and pending-sync checks so a single user with both problems gets at
// most one push per cooldown window.
const COOLDOWN_MS = 30 * 60 * 1000;

// Hard cap on consecutive failed wake attempts. Without this, users with
// broken silent-push delivery get pinged forever on every cron tick the
// moment their cooldown expires - one production user accumulated 292
// wakes in 14 days (~21/day) because their device never responds and
// their autoRecordingActive flag never clears.
//
// Threshold tuning: at the 30-min cooldown, 4 attempts spans roughly 2
// hours of unresponsive device. If the silent push hasn't broken
// through in that window, it almost certainly never will - the device
// is uninstalled, offline, in deep suspension, or has a stale push
// token. Anything beyond is wasted budget + noise in the diagnostic
// dashboard.
const MAX_RECENT_ATTEMPTS = 4;
const RECENT_ATTEMPT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h
// Rate-limit watchdog.gave_up event logging to avoid replacing one
// noisy event (silent_push_sent) with another (gave_up). One log per
// user per 6 hours is enough for the admin signal.
const GAVE_UP_LOG_WINDOW_MS = 6 * 60 * 60 * 1000;
const lastGaveUpLoggedAt = new Map<string, number>();

// Only act on users whose last heartbeat is recent. Older than this and
// we don't have reliable data - the device might have legitimately
// finalised the trip and just hasn't sent a fresh heartbeat yet.
const HEARTBEAT_FRESHNESS_MS = 26 * 60 * 60 * 1000; // 26h, slightly more than the 24h heartbeat cadence

// Pending-sync check thresholds. Discovered 4 May 2026 via James Taylor:
// trips finalise via the native background task, get queued in SQLite,
// but the JS runtime dies before the 60s periodicTick can drain. Users
// can sit on a multi-day backlog without realising. The watchdog now
// silent-pushes them too.
//
// MIN: how stale the heartbeat has to be before we assume the JS runtime
// is suspended. Below this and the device's own periodicTick is the
// right tool. 30 min = 30 missed ticks worth of "should have drained
// by now".
//
// MAX: how stale we'll go before giving up. James was 2 days stale; we
// extend to 7 to catch genuinely suspended users without spamming
// inactive ones.
const PENDING_SYNC_MIN_STALE_MS = 30 * 60 * 1000;
const PENDING_SYNC_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
// Only ping users with recent driving signal — confirms they're actively
// using the app, not someone who installed once and stopped.
const PENDING_SYNC_DRIVING_RECENCY_MS = 14 * 24 * 60 * 60 * 1000;

// In-memory cooldown map: userId -> last ping timestamp. Resets on server
// restart, which is fine - the cron will simply re-evaluate next tick.
const lastPingedAt = new Map<string, number>();

interface StuckUser {
  id: string;
  recordingStartedAt: Date | null;
  lastDrivingSpeedAt: Date | null;
  lastHeartbeatAt: Date | null;
  pushToken: string | null;
}

interface PendingSyncUser {
  id: string;
  lastPendingSyncCount: number | null;
  lastSyncQueuePermFailed: number | null;
  lastDrivingSpeedAt: Date | null;
  lastHeartbeatAt: Date | null;
  pushToken: string | null;
}

async function sendSilentPush(
  user: { id: string; pushToken: string | null },
  action: "finalize_check" | "drain_sync",
  metadata: Record<string, unknown>
): Promise<"sent" | "cooldown" | "failed" | "gave_up"> {
  if (!user.pushToken) return "failed";

  const lastPing = lastPingedAt.get(user.id);
  const now = Date.now();
  if (lastPing && now - lastPing < COOLDOWN_MS) {
    return "cooldown";
  }

  // Bail out if we've already tried this user too many times recently.
  // Counts every prior watchdog push to this user (both stuck-recording
  // and pending-sync) in the last RECENT_ATTEMPT_WINDOW_MS - if the
  // device wasn't going to respond to the first 4 pushes, the 5th
  // won't change anything.
  const eventTypes = ["watchdog.silent_push_sent", "watchdog.drain_sync_push_sent"];
  const windowStart = new Date(now - RECENT_ATTEMPT_WINDOW_MS);
  const recentAttempts = await prisma.appEvent.count({
    where: {
      userId: user.id,
      type: { in: eventTypes },
      createdAt: { gte: windowStart },
    },
  });
  if (recentAttempts >= MAX_RECENT_ATTEMPTS) {
    const lastLog = lastGaveUpLoggedAt.get(user.id);
    if (!lastLog || now - lastLog >= GAVE_UP_LOG_WINDOW_MS) {
      logEvent("watchdog.gave_up", user.id, {
        action,
        recentAttempts,
        windowHours: RECENT_ATTEMPT_WINDOW_MS / 3.6e6,
        ...metadata,
      });
      lastGaveUpLoggedAt.set(user.id, now);
    }
    return "gave_up";
  }

  const ticket = await sendPushNotification({
    to: user.pushToken,
    data: { action },
    _contentAvailable: true,
    priority: "high",
    sound: null,
  });

  if (ticket && ticket.status === "ok") {
    lastPingedAt.set(user.id, now);
    logEvent(
      action === "drain_sync" ? "watchdog.drain_sync_push_sent" : "watchdog.silent_push_sent",
      user.id,
      metadata
    );
    return "sent";
  }
  if (ticket?.status === "error") {
    console.warn(
      `[watchdog] Push failed for user ${user.id}: ${ticket.message ?? "unknown"}`
    );
  }
  return "failed";
}

export async function runRecordingWatchdogJob(): Promise<void> {
  const now = Date.now();

  // ── Check 1: stuck auto-recordings ────────────────────────────────
  const staleCutoff = new Date(now - STUCK_THRESHOLD_MS);
  const heartbeatCutoff = new Date(now - HEARTBEAT_FRESHNESS_MS);

  const stuck = await prisma.$queryRaw<StuckUser[]>`
    SELECT id, recordingStartedAt, lastDrivingSpeedAt, lastHeartbeatAt, pushToken
    FROM users
    WHERE autoRecordingActive = true
      AND (lastDrivingSpeedAt IS NULL OR lastDrivingSpeedAt < ${staleCutoff})
      AND lastHeartbeatAt IS NOT NULL
      AND lastHeartbeatAt > ${heartbeatCutoff}
      AND pushToken IS NOT NULL
  `;

  let stuckPinged = 0;
  let stuckCooldown = 0;
  let stuckGaveUp = 0;
  for (const user of stuck) {
    const stuckMs =
      user.lastDrivingSpeedAt != null
        ? now - user.lastDrivingSpeedAt.getTime()
        : null;
    const result = await sendSilentPush(user, "finalize_check", {
      stuckMs,
      recordingStartedAt: user.recordingStartedAt?.toISOString() ?? null,
      lastDrivingSpeedAt: user.lastDrivingSpeedAt?.toISOString() ?? null,
    });
    if (result === "sent") stuckPinged++;
    else if (result === "cooldown") stuckCooldown++;
    else if (result === "gave_up") stuckGaveUp++;
  }

  // ── Check 2: pending sync queue + suspended JS runtime ────────────
  //
  // The sister failure mode to stuck recordings: trips/earnings/etc were
  // queued for sync, but iOS suspended the JS runtime before the 60s
  // periodicTick could drain. The user sees their data on-device but
  // the server has no record. Discovered 4 May 2026 via James Taylor —
  // 2-day-old queue with finalised trips that never reached us.
  //
  // Criteria:
  //   - lastPendingSyncCount > 0 OR lastSyncQueuePermFailed > 0
  //   - heartbeat is stale enough that 30+ periodicTicks should have
  //     drained the queue by now (so the runtime is genuinely dead)
  //   - heartbeat isn't SO stale that the user has clearly moved on
  //   - lastDrivingSpeedAt within ~2 weeks (active user, not a dormant
  //     install we'd be wasting silent-push budget on)
  const minStaleHb = new Date(now - PENDING_SYNC_MIN_STALE_MS);
  const maxStaleHb = new Date(now - PENDING_SYNC_MAX_STALE_MS);
  const drivingRecency = new Date(now - PENDING_SYNC_DRIVING_RECENCY_MS);

  const pendingSync = await prisma.$queryRaw<PendingSyncUser[]>`
    SELECT id, lastPendingSyncCount, lastSyncQueuePermFailed,
           lastDrivingSpeedAt, lastHeartbeatAt, pushToken
    FROM users
    WHERE (
        (lastPendingSyncCount IS NOT NULL AND lastPendingSyncCount > 0)
        OR (lastSyncQueuePermFailed IS NOT NULL AND lastSyncQueuePermFailed > 0)
      )
      AND lastHeartbeatAt IS NOT NULL
      AND lastHeartbeatAt < ${minStaleHb}
      AND lastHeartbeatAt > ${maxStaleHb}
      AND lastDrivingSpeedAt IS NOT NULL
      AND lastDrivingSpeedAt > ${drivingRecency}
      AND pushToken IS NOT NULL
  `;

  let syncPinged = 0;
  let syncCooldown = 0;
  let syncGaveUp = 0;
  for (const user of pendingSync) {
    const heartbeatStaleMs =
      user.lastHeartbeatAt != null
        ? now - user.lastHeartbeatAt.getTime()
        : null;
    const result = await sendSilentPush(user, "drain_sync", {
      pendingSyncCount: user.lastPendingSyncCount,
      permFailedCount: user.lastSyncQueuePermFailed,
      heartbeatStaleMs,
      lastHeartbeatAt: user.lastHeartbeatAt?.toISOString() ?? null,
    });
    if (result === "sent") syncPinged++;
    else if (result === "cooldown") syncCooldown++;
    else if (result === "gave_up") syncGaveUp++;
  }

  if (
    stuckPinged > 0 ||
    stuckCooldown > 0 ||
    stuckGaveUp > 0 ||
    syncPinged > 0 ||
    syncCooldown > 0 ||
    syncGaveUp > 0
  ) {
    console.log(
      `[watchdog] stuck=${stuck.length} (pinged ${stuckPinged}, cooldown ${stuckCooldown}, gave_up ${stuckGaveUp}); ` +
        `pendingSync=${pendingSync.length} (pinged ${syncPinged}, cooldown ${syncCooldown}, gave_up ${syncGaveUp})`
    );
  }

  // Discord ping when something actually deserves a human glance.
  // The watchdog is self-healing — every "1 silent push sent" is just
  // the system doing its job, not a problem. Posting those to #mod-chat
  // trained mods to ignore the channel, defeating the alert's purpose.
  //
  // Post only when:
  //   1. 3+ pings in a single run → systemic (multi-user GPS issue,
  //      bad release, etc), worth investigating
  //   2. Any cooldown hits → a user was pinged within the last 30 min
  //      and is STILL stuck. Their device isn't responding to silent
  //      pushes (uninstalled, deep iOS suspension, offline).
  //   3. Any gave_up hits → a user has had 4+ failed silent pushes in
  //      6 hours. Their push delivery is structurally broken. Most
  //      actionable signal we have - these need manual intervention.
  //
  // Single-ping routine cases stay in the server log but not Discord.
  // Silent skip when DISCORD_WEBHOOK_FOUNDER isn't set.
  const actualPings = stuckPinged + syncPinged;
  const cooldownHits = stuckCooldown + syncCooldown;
  const gaveUpHits = stuckGaveUp + syncGaveUp;
  const worthAlerting = actualPings >= 3 || cooldownHits > 0 || gaveUpHits > 0;
  if (worthAlerting) {
    const detailLines: string[] = [];
    if (stuck.length > 0) {
      detailLines.push(
        `Stuck recordings: ${stuck.length} (pinged ${stuckPinged}, cooldown ${stuckCooldown}, gave_up ${stuckGaveUp})`
      );
    }
    if (pendingSync.length > 0) {
      detailLines.push(
        `Pending sync queues: ${pendingSync.length} (pinged ${syncPinged}, cooldown ${syncCooldown}, gave_up ${syncGaveUp})`
      );
    }
    if (gaveUpHits > 0) {
      detailLines.push(
        `🚨 ${gaveUpHits} user(s) hit the 4-attempts-in-6h cap — push delivery is structurally broken for them. Check /admin/build-health for the watchdog.gave_up event list.`
      );
    } else if (cooldownHits > 0) {
      detailLines.push(
        `⚠️ ${cooldownHits} user(s) still stuck after a recent silent push — device may not be responding (uninstalled, offline, or deep iOS suspension).`
      );
    }
    await postFounderAlert({
      severity: gaveUpHits > 0 || actualPings >= 3 || cooldownHits >= 2 ? "warning" : "info",
      title:
        gaveUpHits > 0
          ? `Recording watchdog: ${gaveUpHits} user(s) over retry cap`
          : `Recording watchdog: ${actualPings} silent push${actualPings === 1 ? "" : "es"} sent`,
      detail: detailLines.join("\n"),
    });
  }
}
