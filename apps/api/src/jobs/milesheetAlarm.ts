// Milesheet alarm (4 Oct 2026). Every 6 hours: are team invites going out
// with nobody joining, and is a team's seat billing still failing? The
// decision is services/milesheetAlarmRule.ts; this loads the counts, sends
// through the billing alert channel (push + email + #founder, the same as a
// failed subscription payment) and records each alarm as an AppEvent
// "alert.milesheet" so a condition alarms at most once per 2 days, across
// restarts.

import { prisma } from "../lib/prisma.js";
import { notifyBillingEvent } from "../services/billingAlerts.js";
import { logEvent } from "../services/appEvents.js";
import { countInvites, type TeamEventRow } from "../services/milesheetAdmin.js";
import {
  ALARM_REPEAT_DAYS,
  ALARM_WINDOW_DAYS,
  PAYMENT_FOLLOW_UP_DAYS,
  planMilesheetAlarms,
} from "../services/milesheetAlarmRule.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MILESHEET_ALARM_EVENT = "alert.milesheet";

function metaOf(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function runMilesheetAlarmJob(): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ALARM_WINDOW_DAYS * DAY_MS);
  const paymentSince = new Date(now.getTime() - PAYMENT_FOLLOW_UP_DAYS * DAY_MS);
  const alarmSince = new Date(now.getTime() - ALARM_REPEAT_DAYS * DAY_MS);

  const [inviteRows, failureRows, subUpdates, alarmRows] = await Promise.all([
    prisma.appEvent.findMany({
      where: {
        createdAt: { gte: windowStart },
        type: {
          in: [
            "team.invites_sent",
            "team.org_created",
            "team.manager_nominated",
            "team.invites_bulk_resent",
            "team.invite_accepted",
            "admin.milesheet.resend_invite",
          ],
        },
      },
      select: { type: true, userId: true, metadata: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { type: "team.payment_failed", createdAt: { gte: paymentSince } },
      select: { metadata: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { type: "team.subscription_updated", createdAt: { gte: paymentSince } },
      select: { metadata: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { type: MILESHEET_ALARM_EVENT, createdAt: { gte: alarmSince } },
      select: { metadata: true, createdAt: true },
    }),
  ]);

  const events: TeamEventRow[] = inviteRows.map((r) => {
    const meta = metaOf(r.metadata);
    return { type: r.type, userId: r.userId, orgId: typeof meta?.orgId === "string" ? meta.orgId : null, createdAt: r.createdAt, metadata: meta };
  });
  const invites = countInvites(events, windowStart);

  // A failure is resolved once a later subscription update says active.
  const recoveredAt = new Map<string, Date>();
  for (const u of subUpdates) {
    const meta = metaOf(u.metadata);
    if (typeof meta?.orgId !== "string" || (meta.status !== "active" && meta.status !== "trialing")) continue;
    const prev = recoveredAt.get(meta.orgId);
    if (!prev || u.createdAt > prev) recoveredAt.set(meta.orgId, u.createdAt);
  }
  const failures = failureRows
    .map((r) => ({ orgId: metaOf(r.metadata)?.orgId, at: r.createdAt }))
    .filter((f): f is { orgId: string; at: Date } => typeof f.orgId === "string")
    .filter((f) => {
      const rec = recoveredAt.get(f.orgId);
      return !rec || rec < f.at;
    });
  const orgNames = failures.length
    ? new Map(
        (
          await prisma.organisation.findMany({
            where: { id: { in: [...new Set(failures.map((f) => f.orgId))] } },
            select: { id: true, name: true },
          })
        ).map((o) => [o.id, o.name])
      )
    : new Map<string, string>();

  const lastAlarmAt = new Map<string, Date>();
  for (const a of alarmRows) {
    const key = metaOf(a.metadata)?.conditionKey;
    if (typeof key !== "string") continue;
    const prev = lastAlarmAt.get(key);
    if (!prev || a.createdAt > prev) lastAlarmAt.set(key, a.createdAt);
  }

  const alarms = planMilesheetAlarms({
    now,
    invitesSentInWindow: invites.sent,
    invitesAcceptedInWindow: invites.accepted,
    // A deleted team's failure has nobody left to chase.
    paymentFailures: failures
      .filter((f) => orgNames.has(f.orgId))
      .map((f) => ({ ...f, orgName: orgNames.get(f.orgId)! })),
    lastAlarmAt,
  });

  for (const alarm of alarms) {
    notifyBillingEvent({
      kind: alarm.conditionKey === "invites_stalled" ? "team.invites_stalled" : "team.payment_failing",
      tier: "act_now",
      title: alarm.title,
      body: alarm.body,
      userId: null,
      details: { orgId: alarm.orgId, link: alarm.orgId ? `https://mileclear.com/dashboard/admin/milesheet/${alarm.orgId}` : "https://mileclear.com/dashboard/admin/milesheet" },
    });
    logEvent(MILESHEET_ALARM_EVENT, null, {
      conditionKey: alarm.conditionKey,
      orgId: alarm.orgId,
      invitesSent: invites.sent,
      invitesAccepted: invites.accepted,
    });
  }
  if (alarms.length === 0) {
    console.log(`[milesheet-alarm] quiet (${invites.sent} invites sent, ${invites.accepted} accepted in ${ALARM_WINDOW_DAYS} days; ${failures.length} unresolved payment failures)`);
  }
}
