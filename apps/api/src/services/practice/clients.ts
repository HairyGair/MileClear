// The practice's client list: one row per driver with the columns from
// PROPOSALS section 4, built from grouped aggregates (never trip rows) so
// 200 clients is a handful of queries.
//
// Business only. Personal trips are never counted here; trips not sorted
// yet are a count. Earnings and expenses are counted only for drivers who
// share them.

import { prisma } from "../../lib/prisma.js";
import {
  mtdQuarters,
  practicePeriod,
  quarterDueNext,
  taxYearStartYear,
  ukDateKey,
  type MtdQuarter,
  type PracticePeriod,
} from "@mileclear/shared";
import { linkProblem } from "./access.js";
import { refreshAutoRequests, ukBoundsFromKeys } from "./requests.js";

const DAY = 86_400_000;

export interface MtdSent {
  /** Last day of the period covered (cumulative update), when known. */
  periodEndDate: string | null;
  taxYear: string | null;
  at: Date;
}

/**
 * Quarterly updates the driver sent through MileClear, from the
 * hmrc.period_submitted events (MileClear has no submissions table yet).
 * Cumulative updates carry the period end from Oct 2026; older events are
 * placed by the day they were sent.
 */
export async function loadMtdSent(userIds: string[], since: Date): Promise<Map<string, MtdSent[]>> {
  const out = new Map<string, MtdSent[]>();
  if (userIds.length === 0) return out;
  const rows = await prisma.appEvent.findMany({
    where: { type: "hmrc.period_submitted", userId: { in: userIds }, createdAt: { gte: since } },
    select: { userId: true, metadata: true, createdAt: true },
  });
  for (const r of rows) {
    if (!r.userId) continue;
    const m = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>;
    const list = out.get(r.userId) ?? [];
    list.push({
      periodEndDate: typeof m.periodEndDate === "string" ? m.periodEndDate : null,
      taxYear: typeof m.taxYear === "string" ? m.taxYear : null,
      at: r.createdAt,
    });
    out.set(r.userId, list);
  }
  return out;
}

/** When the update for this quarter went, if it did. */
export function sentForQuarter(sent: MtdSent[] | undefined, q: MtdQuarter): Date | null {
  if (!sent) return null;
  const hits = sent.filter((s) => {
    if (s.taxYear && s.taxYear !== q.taxYear) return false;
    if (s.periodEndDate) return s.periodEndDate >= q.end;
    // No period recorded: an update sent after the quarter ended counts.
    return ukDateKey(s.at) > q.end;
  });
  if (hits.length === 0) return null;
  return hits.reduce((a, b) => (a.at < b.at ? a : b)).at;
}

export type UpdateState =
  | { state: "sent"; sentAt: string; due: string }
  | { state: "not_due"; due: string }
  | { state: "due"; due: string; daysLeft: number }
  | { state: "overdue"; due: string }
  | { state: "not_using_mtd" };

/** The "Quarterly update" column for one quarter. */
export function updateState(args: {
  connected: boolean;
  sentAt: Date | null;
  quarter: MtdQuarter;
  todayKey: string;
}): UpdateState {
  const { quarter: q, todayKey } = args;
  if (args.sentAt) return { state: "sent", sentAt: args.sentAt.toISOString(), due: q.due };
  if (!args.connected) return { state: "not_using_mtd" };
  if (todayKey <= q.end) return { state: "not_due", due: q.due };
  if (todayKey > q.due) return { state: "overdue", due: q.due };
  const daysLeft = Math.round((Date.parse(q.due) - Date.parse(todayKey)) / DAY);
  return { state: "due", due: q.due, daysLeft };
}

export interface ClientRow {
  clientId: string;
  linkId: string;
  name: string;
  email: string;
  vehicleType: string | null;
  workType: string;
  businessMiles: number;
  toSort: number;
  earningsShared: boolean;
  earningsCount: number | null;
  expensesShared: boolean;
  expensesCount: number | null;
  sharePersonalTrips: boolean;
  update: UpdateState;
  lastTripAt: string | null;
  openRequests: number;
  startedAt: string | null;
  endsAt: string | null;
  renewalAskedAt: string | null;
}

export type WaitingState =
  | "invited_not_joined"
  | "waiting_for_client"
  | "wants_to_join"
  | "said_no"
  | "invite_expired";

export interface WaitingRow {
  linkId: string;
  clientId: string | null;
  name: string | null;
  email: string | null;
  state: WaitingState;
  invitedAt: string | null;
  lastResentAt: string | null;
  startedBy: string;
}

export interface EndedRow {
  linkId: string;
  clientId: string | null;
  name: string;
  endedAt: string | null;
  endedBy: string | null;
  canAskAgain: boolean;
}

export interface ClientListResult {
  period: PracticePeriod;
  quarter: MtdQuarter;
  clients: ClientRow[];
  waiting: WaitingRow[];
  ended: EndedRow[];
}

function nameOf(u: { fullName: string | null; displayName: string | null } | null | undefined): string | null {
  return u?.fullName?.trim() || u?.displayName?.trim() || null;
}

/** Everything the client list page needs, for one practice. */
export async function loadClientList(
  practice: { id: string; suspendedAt: Date | null },
  periodKey: string | undefined,
  now: Date = new Date()
): Promise<ClientListResult> {
  const todayKey = ukDateKey(now);
  const period = practicePeriod(todayKey, periodKey);
  const quarter = period.quarter ?? quarterDueNext(todayKey);

  const links = await prisma.practiceLink.findMany({
    where: { practiceId: practice.id, status: { not: "cancelled" } },
    select: {
      id: true,
      clientUserId: true,
      status: true,
      startedBy: true,
      invitedEmail: true,
      invitedName: true,
      inviteExpiresAt: true,
      invitedAt: true,
      lastResentAt: true,
      consentedAt: true,
      startedAt: true,
      endsAt: true,
      endedAt: true,
      endedBy: true,
      askedAgainAt: true,
      updatedAt: true,
      renewalAskedAt: true,
      shareEarnings: true,
      shareExpenses: true,
      sharePersonalTrips: true,
      client: {
        select: {
          id: true,
          email: true,
          fullName: true,
          displayName: true,
          workType: true,
          lastTripAt: true,
          vehicles: { select: { vehicleType: true, isPrimary: true } },
        },
      },
    },
  });

  const live = links.filter((l) => l.client && linkProblem(l, practice, now) === null);
  const ids = live.map((l) => l.client!.id);

  const { start, end } = ukBoundsFromKeys(period.start, period.end);
  const tyStart = taxYearStartYear(todayKey);
  const ty = mtdQuarters(tyStart);
  const tyBounds = ukBoundsFromKeys(ty[0].start, ty[3].end);
  const dateRange = { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T00:00:00Z`) };

  await refreshAutoRequests(ids, now);

  const [business, unsorted, earnings, expenses, hmrc, sent, requests] = ids.length
    ? await Promise.all([
        prisma.trip.groupBy({
          by: ["userId"],
          where: {
            userId: { in: ids },
            isPhantomTrip: false,
            classification: "business",
            startedAt: { gte: start, lte: end },
          },
          _sum: { distanceMiles: true },
        }),
        prisma.trip.groupBy({
          by: ["userId"],
          where: {
            userId: { in: ids },
            isPhantomTrip: false,
            classification: "unclassified",
            startedAt: { gte: tyBounds.start, lte: tyBounds.end },
          },
          _count: { _all: true },
        }),
        prisma.earning.groupBy({
          by: ["userId"],
          where: { userId: { in: ids }, periodStart: dateRange },
          _count: { _all: true },
        }),
        prisma.expense.groupBy({
          by: ["userId"],
          where: { userId: { in: ids }, date: dateRange },
          _count: { _all: true },
        }),
        prisma.hmrcConnection.findMany({
          where: { userId: { in: ids }, disconnectedAt: null },
          select: { userId: true },
        }),
        loadMtdSent(ids, ukBoundsFromKeys(quarter.start, quarter.start).start),
        prisma.practiceRequest.groupBy({
          by: ["clientUserId"],
          where: { practiceId: practice.id, clientUserId: { in: ids }, status: "open" },
          _count: { _all: true },
        }),
      ])
    : [[], [], [], [], [], new Map<string, MtdSent[]>(), []];

  const milesBy = new Map(business.map((g) => [g.userId, g._sum.distanceMiles ?? 0]));
  const sortBy = new Map(unsorted.map((g) => [g.userId, g._count._all]));
  const earnBy = new Map(earnings.map((g) => [g.userId, g._count._all]));
  const expBy = new Map(expenses.map((g) => [g.userId, g._count._all]));
  const connected = new Set(hmrc.map((h) => h.userId));
  const reqBy = new Map(requests.map((g) => [g.clientUserId, g._count._all]));

  const clients: ClientRow[] = live.map((l) => {
    const c = l.client!;
    const primary = c.vehicles.find((v) => v.isPrimary) ?? c.vehicles[0];
    const employee = c.workType === "employee";
    return {
      clientId: c.id,
      linkId: l.id,
      name: nameOf(c) ?? c.email,
      email: c.email,
      vehicleType: primary?.vehicleType ?? null,
      workType: c.workType,
      businessMiles: Math.round((milesBy.get(c.id) ?? 0) * 10) / 10,
      toSort: sortBy.get(c.id) ?? 0,
      earningsShared: l.shareEarnings && !employee,
      earningsCount: l.shareEarnings && !employee ? earnBy.get(c.id) ?? 0 : null,
      expensesShared: l.shareExpenses,
      expensesCount: l.shareExpenses ? expBy.get(c.id) ?? 0 : null,
      sharePersonalTrips: l.sharePersonalTrips,
      update: updateState({
        connected: connected.has(c.id),
        sentAt: sentForQuarter(sent.get(c.id), quarter),
        quarter,
        todayKey,
      }),
      lastTripAt: c.lastTripAt?.toISOString() ?? null,
      openRequests: reqBy.get(c.id) ?? 0,
      startedAt: l.startedAt?.toISOString() ?? null,
      endsAt: l.endsAt?.toISOString() ?? null,
      renewalAskedAt: l.renewalAskedAt?.toISOString() ?? null,
    };
  });
  // Default order: who needs chasing first.
  clients.sort((a, b) => b.toSort - a.toSort || a.name.localeCompare(b.name, "en-GB"));

  const waiting: WaitingRow[] = [];
  const ended: EndedRow[] = [];
  for (const l of links) {
    if (live.includes(l)) continue;
    // Before a driver has said yes, the practice sees only what it typed
    // (the email and name it invited), never the account's own name. A
    // driver who asked to join, or who shared before, shows as themselves.
    const sharedBefore = l.startedBy === "driver" || !!l.startedAt || !!l.consentedAt;
    const name = sharedBefore && l.client ? nameOf(l.client) : l.invitedName;
    const email = sharedBefore && l.client ? l.client.email : l.invitedEmail ?? null;
    if (l.status === "invited") {
      const expired = !l.inviteExpiresAt || l.inviteExpiresAt.getTime() <= now.getTime();
      waiting.push({
        linkId: l.id,
        clientId: null,
        name,
        email,
        state: expired ? "invite_expired" : l.client ? "waiting_for_client" : "invited_not_joined",
        invitedAt: l.invitedAt?.toISOString() ?? null,
        lastResentAt: l.lastResentAt?.toISOString() ?? null,
        startedBy: l.startedBy,
      });
    } else if (l.status === "pending_practice") {
      waiting.push({
        linkId: l.id,
        clientId: l.client?.id ?? null,
        name,
        email,
        state: "wants_to_join",
        invitedAt: (l.consentedAt ?? l.invitedAt)?.toISOString() ?? null,
        lastResentAt: null,
        startedBy: l.startedBy,
      });
    } else if (l.status === "declined" && l.endedBy !== "practice") {
      // Said no: shown for 30 days, and cannot be re-invited in that time.
      if (l.endedAt && now.getTime() - l.endedAt.getTime() < 30 * DAY) {
        waiting.push({
          linkId: l.id,
          clientId: l.client?.id ?? null,
          name,
          email,
          state: "said_no",
          invitedAt: l.invitedAt?.toISOString() ?? null,
          lastResentAt: null,
          startedBy: l.startedBy,
        });
      }
    } else if (l.status === "ended" || l.status === "active") {
      // Ended by the driver, or run past its date. Shown for 90 days.
      const endedAt = l.status === "ended" ? l.endedAt : l.endsAt;
      if (endedAt && now.getTime() - endedAt.getTime() < 90 * DAY) {
        ended.push({
          linkId: l.id,
          clientId: l.client?.id ?? null,
          name: name ?? "Former client",
          endedAt: endedAt.toISOString(),
          endedBy: l.status === "ended" ? l.endedBy : "expiry",
          canAskAgain:
            !!l.client &&
            (!l.askedAgainAt || now.getTime() - l.askedAgainAt.getTime() >= 30 * DAY),
        });
      }
    }
  }
  // Practice decisions first.
  const order: Record<WaitingState, number> = {
    wants_to_join: 0,
    waiting_for_client: 1,
    invited_not_joined: 2,
    invite_expired: 3,
    said_no: 4,
  };
  waiting.sort((a, b) => order[a.state] - order[b.state]);

  return { period, quarter, clients, waiting, ended };
}
