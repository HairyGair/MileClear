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

// Recording is "stuck" if no driving speed seen for more than this.
// Generous on purpose - a user genuinely stopped at lights, in a tunnel,
// or in heavy traffic could legitimately go 10-15 min without driving
// speed. 30 minutes lets normal pauses through but catches truly stuck
// recordings reliably.
const STUCK_THRESHOLD_MS = 30 * 60 * 1000;

// Don't ping the same user more than once per 30 minutes. Prevents the
// silent-push budget from being burned on a user whose device is just
// not responding (genuinely offline).
const COOLDOWN_MS = 30 * 60 * 1000;

// Only act on users whose last heartbeat is recent. Older than this and
// we don't have reliable data - the device might have legitimately
// finalised the trip and just hasn't sent a fresh heartbeat yet.
const HEARTBEAT_FRESHNESS_MS = 26 * 60 * 60 * 1000; // 26h, slightly more than the 24h heartbeat cadence

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

export async function runRecordingWatchdogJob(): Promise<void> {
  const now = Date.now();
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

  if (stuck.length === 0) {
    return;
  }

  let pinged = 0;
  let cooldown = 0;

  for (const user of stuck) {
    if (!user.pushToken) continue;

    const lastPing = lastPingedAt.get(user.id);
    if (lastPing && now - lastPing < COOLDOWN_MS) {
      cooldown++;
      continue;
    }

    // Silent push. The mobile listener checks data.action === "finalize_check"
    // and calls finalizeStaleAutoRecordings(). No alert / sound / title -
    // the user sees nothing.
    const ticket = await sendPushNotification({
      to: user.pushToken,
      data: { action: "finalize_check" },
      _contentAvailable: true,
      priority: "high",
      sound: null,
    });

    if (ticket && ticket.status === "ok") {
      lastPingedAt.set(user.id, now);
      pinged++;

      // Log so admin can see how often the watchdog fires per user.
      // Useful for spotting users who get pinged repeatedly (their
      // device probably isn't responding to silent pushes at all).
      const stuckMs =
        user.lastDrivingSpeedAt != null
          ? now - user.lastDrivingSpeedAt.getTime()
          : null;
      logEvent("watchdog.silent_push_sent", user.id, {
        stuckMs,
        recordingStartedAt: user.recordingStartedAt?.toISOString() ?? null,
        lastDrivingSpeedAt: user.lastDrivingSpeedAt?.toISOString() ?? null,
      });
    } else if (ticket?.status === "error") {
      // Push failure typically means the token is invalid (user
      // uninstalled, switched devices). Log but don't retry - the
      // mobile heartbeat will refresh the token if the user is
      // genuinely active.
      console.warn(
        `[watchdog] Push failed for user ${user.id}: ${ticket.message ?? "unknown"}`
      );
    }
  }

  if (pinged > 0 || cooldown > 0) {
    console.log(
      `[watchdog] Found ${stuck.length} stuck recording(s). Pinged ${pinged}, cooldown ${cooldown}.`
    );
  }
}
