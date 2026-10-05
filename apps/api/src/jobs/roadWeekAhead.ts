// "Next week on your roads" (Oct 2026): one push on Sunday evening naming
// the planned works starting next week on a driver's usual roads.
//
//   "Next week on your roads"
//   "Durham Road closed from Tue (BT works), plus 2 more"
//
// Who: drivers who switched road alerts on (pushPrefs.roadAlerts === true,
// the same opt-in as the pre-departure alert; there is no separate switch)
// and have a push token.
//
// When: Sunday from 18:00 UK time, on the 30-minute windowed runner. The
// window runs to 19:59 so a driver on the road at 18:00 gets it on a later
// tick rather than at the wheel.
//
// Respect, in code:
//   - once per driver per week: an AppEvent road_alert.week_ahead_sent with
//     the ISO week of the week it describes;
//   - the road alerts daily cap: no week-ahead push on a day the driver
//     already had a road alert (and the pre-departure job counts this one);
//   - quiet hours (checked here, and lib/push.ts holds the push anyway);
//   - never while they are likely driving;
//   - nothing to say, no push.
//
// Gate: ROAD_WEEK_AHEAD_PUSH. Nothing runs unless it is exactly "1". Read
// what it would send with scripts/dry-run-week-ahead.mjs first.
//
// Every push sets data.action = "open_road_alerts" with section "week", so
// the app opens Road alerts at the "Coming up" section (older apps just open
// Road alerts).

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { logEvent } from "../services/appEvents.js";
import { pushPrefOptedIn } from "../services/pushPrefs.js";
import { isPushQuietHours } from "../services/pushQuietHoursRule.js";
import { MAX_ROAD_ALERTS_PER_DAY, ROAD_ALERT_SENT_EVENT, isLikelyDriving } from "../services/roadAlertsRule.js";
import { loadCorridor, loadDismissedIds } from "../services/roadAlerts.js";
import { isStreetManagerEnabled } from "../services/streetManager.js";
import { weekAheadForCorridor } from "../services/roadWeekAhead.js";
import {
  WEEK_AHEAD_SENT_EVENT,
  WEEK_AHEAD_SKIPPED_EVENT,
  buildWeekAheadPushCopy,
  inWeekAheadSendWindow,
  roadWeekAheadEnabled,
  weekAheadWindow,
  type WeekAheadCopy,
  type WeekAheadSelection,
} from "../services/roadWeekAheadRule.js";
import { localDayBounds } from "./eveningDigest.js";

const BATCH_SIZE = 50;
const DAY_MS = 86400000;

export interface WeekAheadPlan {
  userId: string;
  pushToken: string;
  selection: WeekAheadSelection;
  copy: WeekAheadCopy;
}

export interface WeekAheadPlanResult {
  weekKey: string;
  candidates: number;
  plans: WeekAheadPlan[];
  skipped: Record<string, number>;
}

export interface WeekAheadPlanOptions {
  /** Leave out drivers who already had this week's push or a road alert
   *  today. The dry run turns this off to see the whole picture. */
  checkSent: boolean;
  /** Leave out drivers who look to be driving right now. */
  checkDriving: boolean;
}

/** Who would get a week-ahead push at `now`, and with what words. Reads only;
 *  sends nothing and writes nothing. Shared by the job and the dry run. */
export async function planRoadWeekAhead(now: Date, opts: WeekAheadPlanOptions): Promise<WeekAheadPlanResult> {
  const window = weekAheadWindow(now);
  const result: WeekAheadPlanResult = { weekKey: window.weekKey, candidates: 0, plans: [], skipped: {} };
  const skip = (why: string) => (result.skipped[why] = (result.skipped[why] ?? 0) + 1);

  const users = await prisma.user.findMany({
    where: { pushToken: { not: null }, pushPrefs: { path: "$.roadAlerts", equals: true } },
    select: { id: true, pushToken: true, pushPrefs: true, autoRecordingActive: true, recordingStartedAt: true },
  });
  const optedIn = users.filter((u) => u.pushToken && pushPrefOptedIn(u.pushPrefs, "roadAlerts"));
  result.candidates = optedIn.length;
  if (optedIn.length === 0) return result;

  const today = localDayBounds(now);

  for (let i = 0; i < optedIn.length; i += BATCH_SIZE) {
    const batch = optedIn.slice(i, i + BATCH_SIZE);
    const ids = batch.map((u) => u.id);

    const [sentRows, recentTrips, openShifts, dismissedByUser] = await Promise.all([
      opts.checkSent
        ? prisma.appEvent.findMany({
            where: {
              userId: { in: ids },
              type: { in: [WEEK_AHEAD_SENT_EVENT, ROAD_ALERT_SENT_EVENT] },
              createdAt: { gte: new Date(now.getTime() - 8 * DAY_MS) },
            },
            select: { userId: true, type: true, metadata: true, createdAt: true },
          })
        : Promise.resolve([]),
      opts.checkDriving
        ? prisma.trip.findMany({
            where: { userId: { in: ids }, startedAt: { gte: new Date(now.getTime() - 6 * 3600000) } },
            select: { userId: true, startedAt: true, endedAt: true },
            orderBy: { startedAt: "desc" },
          })
        : Promise.resolve([]),
      opts.checkDriving
        ? prisma.shift.findMany({
            where: { userId: { in: ids }, status: "active", startedAt: { gte: new Date(now.getTime() - 16 * 3600000) } },
            select: { userId: true, startedAt: true },
          })
        : Promise.resolve([]),
      loadDismissedIds(ids, now),
    ]);

    for (const user of batch) {
      if (opts.checkSent) {
        const mine = sentRows.filter((r) => r.userId === user.id);
        if (alreadySentForWeek(mine, window.weekKey)) { skip("already_sent_this_week"); continue; }
        const todayCount = mine.filter((r) => r.createdAt >= today.start).length;
        if (todayCount >= MAX_ROAD_ALERTS_PER_DAY) { skip("road_alert_cap_today"); continue; }
      }
      if (opts.checkDriving) {
        const lastTrip = recentTrips.find((t) => t.userId === user.id) ?? null;
        const shift = openShifts.find((s) => s.userId === user.id) ?? null;
        const driving = isLikelyDriving(
          {
            lastTripStartedAt: lastTrip?.startedAt ?? null,
            lastTripEndedAt: lastTrip?.endedAt ?? null,
            autoRecordingActive: user.autoRecordingActive,
            recordingStartedAt: user.recordingStartedAt,
            activeShiftStartedAt: shift?.startedAt ?? null,
          },
          now
        );
        if (driving) { skip("likely_driving"); continue; }
      }

      let selection: WeekAheadSelection;
      try {
        const corridor = await loadCorridor(user.id, now);
        if (!corridor.bbox || corridor.cells.size === 0) { skip("no_usual_roads"); continue; }
        selection = await weekAheadForCorridor(corridor, window, now, dismissedByUser.get(user.id) ?? new Set());
      } catch (err) {
        console.error("[jobs/roadWeekAhead] plan failed:", (err as Error).message);
        skip("plan_failed");
        continue;
      }
      const copy = buildWeekAheadPushCopy(selection);
      if (!copy) { skip("nothing_planned"); continue; }
      result.plans.push({ userId: user.id, pushToken: user.pushToken!, selection, copy });
    }
  }
  return result;
}

/** True when one of these AppEvent rows is a week-ahead push for this week. */
export function alreadySentForWeek(rows: { type: string; metadata: unknown }[], weekKey: string): boolean {
  return rows.some(
    (r) => r.type === WEEK_AHEAD_SENT_EVENT && (r.metadata as { week?: unknown } | null)?.week === weekKey
  );
}

export interface RoadWeekAheadJobResult {
  weekKey: string;
  candidates: number;
  sent: number;
  skipped: Record<string, number>;
}

export async function runRoadWeekAheadJob(now: Date = new Date()): Promise<RoadWeekAheadJobResult | void> {
  if (!roadWeekAheadEnabled()) return;
  if (!isStreetManagerEnabled()) return;
  if (!inWeekAheadSendWindow(now)) return;
  if (isPushQuietHours(now)) return;

  const plan = await planRoadWeekAhead(now, { checkSent: true, checkDriving: true });
  const result: RoadWeekAheadJobResult = {
    weekKey: plan.weekKey,
    candidates: plan.candidates,
    sent: 0,
    skipped: { ...plan.skipped },
  };
  const skip = (why: string) => (result.skipped[why] = (result.skipped[why] ?? 0) + 1);

  for (let i = 0; i < plan.plans.length; i += 100) {
    const chunk = plan.plans.slice(i, i + 100);
    const messages: ExpoPushMessage[] = chunk.map((p) => ({
      to: p.pushToken,
      title: p.copy.title,
      body: p.copy.body,
      sound: "default",
      data: { type: "road_alert_week", action: "open_road_alerts", section: "week", week: plan.weekKey },
    }));
    const tickets = await sendPushNotifications(messages);
    chunk.forEach((p, j) => {
      if (tickets[j]?.status !== "ok") { skip("push_failed"); return; }
      result.sent++;
      // Counts only: no street, promoter or place goes into the log.
      logEvent(WEEK_AHEAD_SENT_EVENT, p.userId, {
        week: plan.weekKey,
        items: p.selection.items.length,
        total: p.selection.total,
        topTier: p.selection.items[0]?.tier ?? null,
        topTrafficManagement: p.selection.items[0]?.trafficManagement ?? null,
      });
    });
  }

  if (result.candidates > 0) {
    // One row per run, no personal data: how many went and why the rest did not.
    logEvent(WEEK_AHEAD_SKIPPED_EVENT, null, {
      week: result.weekKey,
      candidates: result.candidates,
      sent: result.sent,
      skipped: result.skipped,
    });
  }
  if (result.sent > 0) {
    console.log(
      `[jobs/roadWeekAhead] ${result.weekKey}: sent ${result.sent} of ${result.candidates} opted in; ` +
        `skipped ${JSON.stringify(result.skipped)}`
    );
  }
  return result;
}
