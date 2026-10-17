// "Road reopened" (Oct 2026): a closure on a driver's usual roads finished
// earlier than planned.
//
//   "Road reopened"
//   "Durham Road has reopened, earlier than planned."
//
// services/streetManager.ts spots the moment as each SNS message is stored
// (services/roadReopenedRule.ts decides) and writes one pending AppEvent
// (road_alert.reopened_pending) per works reference, with the street and a
// thinned geometry. Nothing else happens on the SNS request. This job, on the
// 30-minute windowed runner, matches the pending ones against each opted-in
// driver's usual roads and sends.
//
// Who: drivers who switched road alerts on (pushPrefs.roadAlerts === true)
// and have a push token, whose usual roads the closure was on.
//
// Respect, in code:
//   - one "Road reopened" push per driver per UK day;
//   - the road alerts daily cap: none on a day the driver already had a road
//     alert or the week-ahead push (a reopened push does not count against
//     the pre-departure alert, so good news never blocks a closure warning);
//   - quiet hours: the job does nothing in them, and a pending reopening
//     waits for the next allowed tick (up to 14 hours after it finished,
//     so an evening reopening arrives at 08:00);
//   - never while they are likely driving (it waits for a later tick);
//   - never for a closure the driver dismissed, never twice for the same
//     works, never one with no street name;
//   - works put back in place since (a work stop reverted) are not sent.
//
// Gate: ROAD_REOPENED_PUSH. Nothing is sent unless it is exactly "1". The
// pending rows are written whatever the flag says (no driver sees them), so
// scripts/dry-run-road-reopened.mjs can show who would have had one.
//
// Every push sets data.action = "open_road_alerts".

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { logEvent } from "../services/appEvents.js";
import { pushPrefOptedIn } from "../services/pushPrefs.js";
import { isPushQuietHours } from "../services/pushQuietHoursRule.js";
import { matchEventToCorridor } from "../services/roadCorridor.js";
import { MAX_ROAD_ALERTS_PER_DAY, ROAD_ALERT_SENT_EVENT, isLikelyDriving } from "../services/roadAlertsRule.js";
import { WEEK_AHEAD_SENT_EVENT } from "../services/roadWeekAheadRule.js";
import {
  REOPENED_PENDING_MAX_AGE_MS,
  ROAD_REOPENED_PENDING_EVENT,
  ROAD_REOPENED_SENT_EVENT,
  ROAD_REOPENED_SKIPPED_EVENT,
  buildReopenedCopy,
  isFinishedStatus,
  latestPerReference,
  roadReopenedEnabled,
  sentReferencesFrom,
  type ReopenedCopy,
  type ReopenedFinding,
} from "../services/roadReopenedRule.js";
import { loadCorridor, loadDismissedIds } from "../services/roadAlerts.js";
import { isStreetManagerEnabled } from "../services/streetManager.js";
import { localDayBounds } from "./eveningDigest.js";

const BATCH_SIZE = 50;
const DAY_MS = 86400000;
/** References already announced this far back are never announced again. */
const SENT_LOOKBACK_DAYS = 14;

export interface ReopenedPlan {
  userId: string;
  pushToken: string;
  finding: ReopenedFinding;
  copy: ReopenedCopy;
  /** Days in the last 6 weeks they drove the reopened stretch. */
  days: number;
  /** Other reopenings on their roads in the same run. */
  others: number;
}

export interface ReopenedPlanResult {
  pending: number;
  candidates: number;
  plans: ReopenedPlan[];
  skipped: Record<string, number>;
}

export interface ReopenedPlanOptions {
  /** How far back to read pending reopenings (the job: 14 hours). */
  lookbackMs: number;
  /** Leave out drivers already sent one today, at the road alerts cap, or
   *  already told about the works. The dry run can turn this off. */
  checkSent: boolean;
  /** Leave out drivers who look to be driving right now. */
  checkDriving: boolean;
  /** Leave out works put back in place since. */
  checkReverted: boolean;
}

/** Who would get a "Road reopened" push at `now`, and with what words. Reads
 *  only; sends nothing and writes nothing. Shared by the job and the dry run. */
export async function planRoadReopened(now: Date, opts: ReopenedPlanOptions): Promise<ReopenedPlanResult> {
  const result: ReopenedPlanResult = { pending: 0, candidates: 0, plans: [], skipped: {} };
  const skip = (why: string) => (result.skipped[why] = (result.skipped[why] ?? 0) + 1);

  const rows = await prisma.appEvent.findMany({
    where: { type: ROAD_REOPENED_PENDING_EVENT, createdAt: { gte: new Date(now.getTime() - opts.lookbackMs), lte: now } },
    select: { createdAt: true, metadata: true },
  });
  let findings = latestPerReference(rows).filter((f) => buildReopenedCopy(f) != null);
  result.pending = findings.length;
  if (findings.length === 0) return result;

  if (opts.checkReverted) {
    // A work stop reverted, or the closure booked again under the same
    // reference: the row is back and unfinished.
    const live = await prisma.streetWorksEvent.findMany({
      where: { reference: { in: findings.map((f) => f.reference) } },
      select: { reference: true, workStatus: true, startAt: true, endAt: true, trafficManagement: true },
    });
    const back = new Set(
      live
        .filter(
          (r) =>
            r.trafficManagement === "road_closure" &&
            !isFinishedStatus(r.workStatus) &&
            (r.endAt == null || r.endAt.getTime() > now.getTime()) &&
            (r.startAt == null || r.startAt.getTime() <= now.getTime())
        )
        .map((r) => r.reference)
    );
    const before = findings.length;
    findings = findings.filter((f) => !back.has(f.reference));
    if (findings.length < before) result.skipped.closure_back_in_place = before - findings.length;
    if (findings.length === 0) return result;
  }

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
              type: { in: [ROAD_REOPENED_SENT_EVENT, ROAD_ALERT_SENT_EVENT, WEEK_AHEAD_SENT_EVENT] },
              createdAt: { gte: new Date(now.getTime() - SENT_LOOKBACK_DAYS * DAY_MS) },
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
      const mine = sentRows.filter((r) => r.userId === user.id);
      const sentRefs = sentReferencesFrom(mine.filter((r) => r.type === ROAD_REOPENED_SENT_EVENT).map((r) => r.metadata));
      const dismissed = dismissedByUser.get(user.id) ?? new Set<string>();

      let matches: { finding: ReopenedFinding; days: number }[];
      try {
        const corridor = await loadCorridor(user.id, now);
        if (!corridor.bbox || corridor.cells.size === 0) { skip("no_usual_roads"); continue; }
        matches = [];
        for (const f of findings) {
          const m = matchEventToCorridor(corridor, {
            lines: f.lines,
            points: f.points,
            directionMode: f.lines.length > 0 ? "axis" : "none",
          });
          if (m.matched) matches.push({ finding: f, days: m.days });
        }
      } catch (err) {
        console.error("[jobs/roadReopened] plan failed:", (err as Error).message);
        skip("plan_failed");
        continue;
      }
      if (matches.length === 0) { skip("not_on_their_roads"); continue; }
      const fresh = matches
        .filter((m) => !dismissed.has(`sm:${m.finding.reference}`))
        .filter((m) => !sentRefs.has(m.finding.reference));
      if (fresh.length === 0) {
        skip(matches.some((m) => dismissed.has(`sm:${m.finding.reference}`)) ? "dismissed" : "already_told");
        continue;
      }

      if (opts.checkSent) {
        const todays = mine.filter((r) => r.createdAt >= today.start);
        if (todays.some((r) => r.type === ROAD_REOPENED_SENT_EVENT)) { skip("reopened_sent_today"); continue; }
        if (todays.length >= MAX_ROAD_ALERTS_PER_DAY) { skip("road_alert_cap_today"); continue; }
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

      // The road they drive most, then the most recent reopening.
      fresh.sort((a, b) => b.days - a.days || b.finding.finishedAt.getTime() - a.finding.finishedAt.getTime());
      const pick = fresh[0];
      const copy = buildReopenedCopy(pick.finding)!;
      result.plans.push({
        userId: user.id,
        pushToken: user.pushToken!,
        finding: pick.finding,
        copy,
        days: pick.days,
        others: fresh.length - 1,
      });
    }
  }
  return result;
}

export interface RoadReopenedJobResult {
  pending: number;
  candidates: number;
  sent: number;
  skipped: Record<string, number>;
}

export async function runRoadReopenedJob(now: Date = new Date()): Promise<RoadReopenedJobResult | void> {
  if (!roadReopenedEnabled()) return;
  if (!isStreetManagerEnabled()) return;
  // Pending reopenings wait for the next allowed tick.
  if (isPushQuietHours(now)) return;

  const plan = await planRoadReopened(now, {
    lookbackMs: REOPENED_PENDING_MAX_AGE_MS,
    checkSent: true,
    checkDriving: true,
    checkReverted: true,
  });
  const result: RoadReopenedJobResult = {
    pending: plan.pending,
    candidates: plan.candidates,
    sent: 0,
    skipped: { ...plan.skipped },
  };
  if (plan.pending === 0) return result;
  const skip = (why: string) => (result.skipped[why] = (result.skipped[why] ?? 0) + 1);

  for (let i = 0; i < plan.plans.length; i += 100) {
    const chunk = plan.plans.slice(i, i + 100);
    const messages: ExpoPushMessage[] = chunk.map((p) => ({
      to: p.pushToken,
      title: p.copy.title,
      body: p.copy.body,
      sound: "default",
      data: { type: "road_reopened", action: "open_road_alerts", eventId: `sm:${p.finding.reference}` },
    }));
    const tickets = await sendPushNotifications(messages);
    chunk.forEach((p, j) => {
      if (tickets[j]?.status !== "ok") { skip("push_failed"); return; }
      result.sent++;
      // The works reference (public Street Manager data) for the
      // never-twice check; no street or place.
      logEvent(ROAD_REOPENED_SENT_EVENT, p.userId, {
        reference: p.finding.reference,
        days: p.days,
        others: p.others,
        early: p.finding.plannedEndAt != null,
        workCategory: p.finding.workCategory,
      });
    });
  }

  // One row per run that sent anything, no personal data: how many went and
  // why the rest did not.
  if (result.sent > 0) {
    logEvent(ROAD_REOPENED_SKIPPED_EVENT, null, {
      pending: result.pending,
      candidates: result.candidates,
      sent: result.sent,
      skipped: result.skipped,
    });
  }
  if (result.sent > 0) {
    console.log(
      `[jobs/roadReopened] sent ${result.sent} of ${result.candidates} opted in (${result.pending} reopened); ` +
        `skipped ${JSON.stringify(result.skipped)}`
    );
  }
  return result;
}
