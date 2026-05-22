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
): Promise<"sent" | "cooldown" | "failed"> {
  if (!user.pushToken) return "failed";

  const lastPing = lastPingedAt.get(user.id);
  const now = Date.now();
  if (lastPing && now - lastPing < COOLDOWN_MS) {
    return "cooldown";
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
  }

  if (
    stuckPinged > 0 ||
    stuckCooldown > 0 ||
    syncPinged > 0 ||
    syncCooldown > 0
  ) {
    console.log(
      `[watchdog] stuck=${stuck.length} (pinged ${stuckPinged}, cooldown ${stuckCooldown}); ` +
        `pendingSync=${pendingSync.length} (pinged ${syncPinged}, cooldown ${syncCooldown})`
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
  //      pushes (uninstalled, deep iOS suspension, offline). Most
  //      actionable signal we have.
  //
  // Single-ping routine cases stay in the server log (line 222 above)
  // but not Discord. Silent skip when DISCORD_WEBHOOK_MODCHAT isn't set.
  const actualPings = stuckPinged + syncPinged;
  const cooldownHits = stuckCooldown + syncCooldown;
  const worthAlerting = actualPings >= 3 || cooldownHits > 0;
  if (actualPings > 0 && worthAlerting) {
    const detailLines: string[] = [];
    if (stuck.length > 0) {
      detailLines.push(`Stuck recordings: ${stuck.length} (pinged ${stuckPinged}, cooldown ${stuckCooldown})`);
    }
    if (pendingSync.length > 0) {
      detailLines.push(`Pending sync queues: ${pendingSync.length} (pinged ${syncPinged}, cooldown ${syncCooldown})`);
    }
    if (cooldownHits > 0) {
      detailLines.push(
        `⚠️ ${cooldownHits} user(s) still stuck after a recent silent push — device may not be responding (uninstalled, offline, or deep iOS suspension).`
      );
    }
    await postFounderAlert({
      severity: actualPings >= 3 || cooldownHits >= 2 ? "warning" : "info",
      title: `Recording watchdog: ${actualPings} silent push${actualPings === 1 ? "" : "es"} sent`,
      detail: detailLines.join("\n"),
    });
  }
}
