// Road alerts trial (2 Oct 2026): the pre-departure heads-up push.
//
//   "Before you set off: M6 closed"
//   "M6 southbound is closed from J14 to J13 until about 10:00. You've driven
//    this way on 9 days in the last 6 weeks."
//
// Runs on its own 10-minute tick (jobs/notifications.ts): the send window is
// 25-45 minutes before each driver's usual first start that weekday, too
// narrow for the 30-minute windowed runner.
//
// For each opted-in driver with a push token (pushPrefs.roadAlerts === true):
//   1. Usual departure for today's weekday (none = no push today).
//   2. 45-60 min before: warm the TomTom tiles their roads touch (prefetch).
//   3. 25-45 min before: quiet hours check (the 05:00-07:59 exemption below),
//      one push per UK day, not while likely driving, never an event already
//      sent in the last 14 days, and only a serious event in effect when they
//      usually leave.
//
// QUIET HOURS: road alerts follow the 21:00-08:00 rule EXCEPT inside the
// driver's own pre-departure window between 05:00 and 07:59
// (roadAlertQuietHoursExempt in services/pushQuietHoursRule.ts). Needs
// Anthony's confirmation; see that function's comment.
//
// Every push sets data.action = "open_road_alerts".

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications } from "../lib/push.js";
import { logEvent } from "../services/appEvents.js";
import { pushPrefOptedIn } from "../services/pushPrefs.js";
import { isPushQuietHours, roadAlertQuietHoursExempt } from "../services/pushQuietHoursRule.js";
import { departurePhase, ukLocalParts } from "../services/roadCorridor.js";
import {
  DEDUPE_LOOKBACK_DAYS,
  MAX_ROAD_ALERTS_PER_DAY,
  ROAD_ALERT_SENT_EVENT,
  buildRoadAlertCopy,
  isLikelyDriving,
  selectPushEvent,
  sentEventIdsFrom,
} from "../services/roadAlertsRule.js";
import {
  loadDepartureProfiles,
  matchedEventsForDriver,
  pruneRoadAlertCaches,
  roadAlertsAvailable,
} from "../services/roadAlerts.js";
import { budgetSnapshot, pruneTileCache } from "../services/tomtomTraffic.js";
import { purgeEndedStreetWorks } from "../services/streetManager.js";
import { localDayBounds } from "./eveningDigest.js";

const BATCH_SIZE = 50;
/** Tiles must be at least this fresh for a push decision. */
const PUSH_FRESHNESS_MS = 15 * 60000;

export interface RoadAlertJobResult {
  candidates: number;
  sent: number;
  prefetched: number;
  skipped: Record<string, number>;
  tomtomUsed?: number;
  streetWorksPurged?: number;
}

let lastPurgeDay = "";

export async function runRoadAlertsJob(now: Date = new Date()): Promise<RoadAlertJobResult | void> {
  const available = roadAlertsAvailable();
  if (!available.incidents && !available.plannedWorks) return;

  pruneTileCache();
  pruneRoadAlertCaches(now);
  const result: RoadAlertJobResult = { candidates: 0, sent: 0, prefetched: 0, skipped: {} };
  const skip = (why: string) => (result.skipped[why] = (result.skipped[why] ?? 0) + 1);

  const today = localDayBounds(now);
  if (lastPurgeDay !== today.key) {
    lastPurgeDay = today.key;
    result.streetWorksPurged = await purgeEndedStreetWorks(now);
  }

  const users = await prisma.user.findMany({
    where: { pushToken: { not: null }, pushPrefs: { path: "$.roadAlerts", equals: true } },
    select: {
      id: true,
      pushToken: true,
      pushPrefs: true,
      autoRecordingActive: true,
      recordingStartedAt: true,
    },
  });
  const optedIn = users.filter((u) => pushPrefOptedIn(u.pushPrefs, "roadAlerts"));
  result.candidates = optedIn.length;
  if (optedIn.length === 0) return result;

  const local = ukLocalParts(now);

  for (let i = 0; i < optedIn.length; i += BATCH_SIZE) {
    const batch = optedIn.slice(i, i + BATCH_SIZE);
    const profiles = await loadDepartureProfiles(batch.map((u) => u.id), now);

    // Only drivers near their departure go any further.
    const near = batch
      .map((u) => {
        const dep = profiles.get(u.id)?.byWeekday[local.weekday] ?? null;
        return { user: u, dep, phase: departurePhase(local.minutes, dep) };
      })
      .filter((x) => {
        if (x.dep == null) { skip("no_usual_departure"); return false; }
        if (x.phase === "outside") { skip("outside_window"); return false; }
        return true;
      });
    if (near.length === 0) continue;

    // Warm the tiles a quarter of an hour ahead, so the send tick has fresh
    // data even if TomTom is slow.
    for (const x of near.filter((n) => n.phase === "prefetch")) {
      try {
        await matchedEventsForDriver(x.user.id, now, PUSH_FRESHNESS_MS);
        result.prefetched++;
      } catch (err) {
        console.error("[jobs/roadAlerts] prefetch failed:", (err as Error).message);
      }
    }

    const senders = near.filter((n) => n.phase === "send");
    if (senders.length === 0) continue;
    const ids = senders.map((s) => s.user.id);

    const [sentRows, recentTrips, openShifts] = await Promise.all([
      prisma.appEvent.findMany({
        where: {
          type: ROAD_ALERT_SENT_EVENT,
          userId: { in: ids },
          createdAt: { gte: new Date(now.getTime() - DEDUPE_LOOKBACK_DAYS * 86400000) },
        },
        select: { userId: true, metadata: true, createdAt: true },
      }),
      prisma.trip.findMany({
        where: { userId: { in: ids }, startedAt: { gte: new Date(now.getTime() - 6 * 3600000) } },
        select: { userId: true, startedAt: true, endedAt: true },
        orderBy: { startedAt: "desc" },
      }),
      prisma.shift.findMany({
        where: { userId: { in: ids }, status: "active", startedAt: { gte: new Date(now.getTime() - 16 * 3600000) } },
        select: { userId: true, startedAt: true },
      }),
    ]);

    for (const { user, dep } of senders) {
      const quiet = isPushQuietHours(now);
      const exempt = roadAlertQuietHoursExempt(now, true);
      if (quiet && !exempt) { skip("quiet_hours"); continue; }

      const mine = sentRows.filter((r) => r.userId === user.id);
      if (mine.filter((r) => r.createdAt >= today.start).length >= MAX_ROAD_ALERTS_PER_DAY) {
        skip("already_sent_today");
        continue;
      }

      const lastTrip = recentTrips.find((t) => t.userId === user.id) ?? null;
      const shift = openShifts.find((s) => s.userId === user.id) ?? null;
      if (
        isLikelyDriving(
          {
            lastTripStartedAt: lastTrip?.startedAt ?? null,
            lastTripEndedAt: lastTrip?.endedAt ?? null,
            autoRecordingActive: user.autoRecordingActive,
            recordingStartedAt: user.recordingStartedAt,
            activeShiftStartedAt: shift?.startedAt ?? null,
          },
          now
        )
      ) {
        skip("likely_driving");
        continue;
      }

      let matches;
      try {
        ({ matches } = await matchedEventsForDriver(user.id, now, PUSH_FRESHNESS_MS));
      } catch (err) {
        console.error("[jobs/roadAlerts] match failed:", (err as Error).message);
        skip("match_failed");
        continue;
      }
      const departureAt = new Date(now.getTime() + (dep! - local.minutes) * 60000);
      const choice = selectPushEvent(matches, {
        departureAt,
        sentEventIds: sentEventIdsFrom(mine.map((r) => r.metadata)),
      });
      if (!choice) { skip("nothing_serious"); continue; }

      const copy = buildRoadAlertCopy(choice.pick, choice.extra, now);
      const tickets = await sendPushNotifications(
        [
          {
            to: user.pushToken!,
            title: copy.title,
            body: copy.body,
            sound: "default",
            data: { type: "road_alert", action: "open_road_alerts", eventId: choice.pick.event.id },
          },
        ],
        // Only this opted-in, pre-departure, 05:00-07:59 case may pass quiet
        // hours; outside quiet hours the flag changes nothing.
        { ignoreQuietHours: exempt }
      );
      if (tickets[0]?.status !== "ok") { skip("push_failed"); continue; }
      result.sent++;
      logEvent(ROAD_ALERT_SENT_EVENT, user.id, {
        eventIds: [choice.pick.event.id],
        source: choice.pick.event.source,
        severity: choice.pick.event.severity,
        category: choice.pick.event.category,
        days: choice.pick.days,
        extra: choice.extra,
        departureMinutes: dep,
        quietHoursExempt: quiet && exempt,
      });
    }
  }

  if (available.incidents) result.tomtomUsed = (await budgetSnapshot(now)).used;
  if (result.sent > 0 || result.prefetched > 0) {
    console.log(
      `[jobs/roadAlerts] sent ${result.sent}, prefetched ${result.prefetched} of ${result.candidates} opted in; ` +
        `skipped ${JSON.stringify(result.skipped)}`
    );
  }
  return result;
}
