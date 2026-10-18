import type { TeamDriverDays, TeamDrivingDay, TeamMonthDays } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { claimableWhere } from "../lib/claimableTrips.js";
import { londonMonthBounds } from "./teamExport.js";

// Milesheet driving times (Oct 2026).
//
// Rob Lyons (Maids Of Glory) asked for his drivers' start and finish times
// for payroll. Most Milesheet drivers never press Start Shift, but their
// business trips mark out a working day, so each UK-local day shows the
// start of the first business drive and the end of the last. A shift the
// driver recorded on a day that also has business trips can widen that
// day; a shift on its own never makes a day. This is driving times, not
// hours worked, and every place it is shown says so.
//
// A manager only sees a driver's times once that driver has been told
// (isDriverToldAboutTimes below), and only from the day the driver joined
// that team.

export const DRIVING_TIMES_LABEL = "Driving times: first drive to last drive. Not hours worked.";

/**
 * App event, one per driver per team, with metadata { orgId }. Recorded
 * when a driver accepts an invite on the web invite page (which shows the
 * consent line before the Accept button), or by
 * scripts/send-driving-times-notice.mjs after the notice email has gone.
 */
export const DRIVING_TIMES_NOTICE_EVENT = "team.driving_times_notice";

/**
 * The notice gate: told means a team.driving_times_notice event for THIS
 * org. Membership acceptedAt is deliberately not used: nominating drivers
 * get it when their manager accepts, admin moves and waitlist-created teams
 * set it too, and none of them saw the consent line.
 */
export function isDriverToldAboutTimes(
  noticeEvents: Array<{ metadata: unknown }>,
  orgId: string
): boolean {
  return noticeEvents.some((e) => (e.metadata as { orgId?: unknown } | null)?.orgId === orgId);
}

// ── Day building ─────────────────────────────────────────────────────────

export interface DrivingInterval {
  startedAt: Date;
  endedAt: Date | null;
}

const LONDON_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function londonParts(d: Date): { date: string; time: string } {
  const parts = LONDON_PARTS.formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return { date: `${p("year")}-${p("month")}-${p("day")}`, time: `${p("hour")}:${p("minute")}` };
}

/** London calendar date ("YYYY-MM-DD") of an instant. */
export function londonDate(d: Date): string {
  return londonParts(d).date;
}

/**
 * The day a driver counts as on this team, for driving times: the earlier of
 * the London day they accepted, the first day of the earliest month their
 * manager approved or queried for them, and (for a driver who set the team
 * up by nominating their manager) the day they created it: nominators get
 * acceptedAt only when the manager accepts. Invites were re-sent after the invite
 * fault (4 Oct 2026), so some drivers' acceptedAt is later than months their
 * manager had already approved (Maids Of Glory approved Marie's September,
 * acceptedAt 4 Oct). A month the manager signed off is a month they were on
 * the team. Null when there is neither.
 */
export function teamStartDate(
  acceptedAt: Date | null,
  earliestApprovalMonth: string | null,
  createdTeamAt: Date | null = null
): string | null {
  const dates = [
    acceptedAt ? londonDate(acceptedAt) : null,
    earliestApprovalMonth ? `${earliestApprovalMonth}-01` : null,
    createdTeamAt ? londonDate(createdTeamAt) : null,
  ].filter((d): d is string => d !== null);
  return dates.length ? dates.sort()[0] : null;
}

/** Earliest approved or queried month per driver in one org. */
export async function earliestApprovalMonths(orgId: string, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.teamApproval.findMany({
    where: { orgId, userId: { in: userIds }, status: { in: ["approved", "queried"] } },
    select: { userId: true, month: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    const prev = out.get(r.userId);
    if (!prev || r.month < prev) out.set(r.userId, r.month);
  }
  return out;
}

/**
 * Builds one row per London day from a driver's business trips and shifts.
 *
 * - Only business trips make a day. A shift counts only on a day that also
 *   has business trips, so an evening gig shift on its own never appears.
 * - The day runs from the earliest start to the latest end across that
 *   day's business trips and shifts together. `source` is "shift" when a
 *   shift supplied the start or the end, otherwise "trips".
 * - A trip or shift belongs to the day it STARTED, even if it ends after
 *   midnight (endsNextDay is then true).
 * - A shift still running (no endedAt) is ignored.
 * - A trip with no endedAt counts as ending when it started.
 * - Callers pass only claimable business, non-phantom trips, so the trip
 *   count matches what the payroll miles cover.
 * - Days outside `opts.month`, and days before `opts.fromDate` (a London
 *   date, the day the driver joined the team), are dropped.
 */
export function buildDrivingDays(
  trips: DrivingInterval[],
  shifts: DrivingInterval[],
  opts: { month?: string; fromDate?: string } = {}
): TeamDrivingDay[] {
  type Acc = { tripStart: number; tripEnd: number; trips: number; shiftStart?: number; shiftEnd?: number };
  const byDay = new Map<string, Acc>();

  for (const t of trips) {
    const s = t.startedAt.getTime();
    if (!Number.isFinite(s)) continue;
    const endMs = t.endedAt ? t.endedAt.getTime() : s;
    const e = Number.isFinite(endMs) ? Math.max(s, endMs) : s;
    const date = londonDate(t.startedAt);
    const a = byDay.get(date);
    if (!a) {
      byDay.set(date, { tripStart: s, tripEnd: e, trips: 1 });
    } else {
      a.trips++;
      a.tripStart = Math.min(a.tripStart, s);
      a.tripEnd = Math.max(a.tripEnd, e);
    }
  }

  for (const sh of shifts) {
    if (!sh.endedAt) continue;
    const s = sh.startedAt.getTime();
    const e = sh.endedAt.getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;
    const a = byDay.get(londonDate(sh.startedAt));
    if (!a) continue; // no business trips that day: the shift alone is not shown
    a.shiftStart = a.shiftStart === undefined ? s : Math.min(a.shiftStart, s);
    a.shiftEnd = a.shiftEnd === undefined ? e : Math.max(a.shiftEnd, e);
  }

  const days: TeamDrivingDay[] = [];
  for (const [date, a] of byDay) {
    if (opts.month && !date.startsWith(`${opts.month}-`)) continue;
    if (opts.fromDate && date < opts.fromDate) continue;
    const startFromShift = a.shiftStart !== undefined && a.shiftStart < a.tripStart;
    const endFromShift = a.shiftEnd !== undefined && a.shiftEnd > a.tripEnd;
    const start = startFromShift ? a.shiftStart! : a.tripStart;
    const end = endFromShift ? a.shiftEnd! : a.tripEnd;
    const startD = new Date(start);
    const endD = new Date(end);
    const endParts = londonParts(endD);
    days.push({
      date,
      start: startD.toISOString(),
      end: endD.toISOString(),
      startLocal: londonParts(startD).time,
      endLocal: endParts.time,
      endsNextDay: endParts.date !== date,
      spanMinutes: Math.round((end - start) / 60000),
      trips: a.trips,
      source: startFromShift || endFromShift ? "shift" : "trips",
    });
  }
  days.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return days;
}

/** 472 minutes -> "7h 52m". */
export function formatSpan(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// ── Loading ──────────────────────────────────────────────────────────────

/**
 * Driving days for the given drivers of one org in one month. Only drivers
 * with an active driver membership in `orgId` are returned, whatever ids
 * are passed; a driver who has not been told gets told:false and no days
 * (their trips are not even read). Days before the London day the driver
 * joined this team (teamStartDate) are left out; with no join date and no
 * approved month it shows no days rather than guessing.
 */
export async function loadTeamDrivingDays(
  orgId: string,
  month: string,
  onlyUserIds?: string[]
): Promise<TeamMonthDays> {
  const { start, end } = londonMonthBounds(month);

  const memberships = await prisma.orgMembership.findMany({
    where: {
      orgId,
      role: "driver",
      status: "active",
      userId: onlyUserIds ? { in: onlyUserIds } : { not: null },
    },
    select: { userId: true, acceptedAt: true, user: { select: { displayName: true, email: true } } },
  });
  const withUser = memberships.filter((m) => !!m.userId);
  const userIds = withUser.map((m) => m.userId!);
  if (userIds.length === 0) return { month, drivers: [] };

  const notices = await prisma.appEvent.findMany({
    where: { type: DRIVING_TIMES_NOTICE_EVENT, userId: { in: userIds } },
    select: { userId: true, metadata: true },
  });
  const noticesBy = new Map<string, Array<{ metadata: unknown }>>();
  for (const n of notices) {
    if (!n.userId) continue;
    const list = noticesBy.get(n.userId);
    if (list) list.push(n);
    else noticesBy.set(n.userId, [n]);
  }

  const told = new Set(
    withUser.filter((m) => isDriverToldAboutTimes(noticesBy.get(m.userId!) ?? [], orgId)).map((m) => m.userId!)
  );
  const toldIds = [...told];

  const [trips, shifts] = toldIds.length
    ? await Promise.all([
        // The same business-trip filter as the payroll miles
        // (computeTeamMonthSummary), phantom trips left out.
        prisma.trip.findMany({
          where: claimableWhere({
            userId: { in: toldIds },
            classification: "business",
            isPhantomTrip: false,
            startedAt: { gte: start, lt: end },
          }),
          select: { userId: true, startedAt: true, endedAt: true },
        }),
        prisma.shift.findMany({
          where: { userId: { in: toldIds }, startedAt: { gte: start, lt: end } },
          select: { userId: true, startedAt: true, endedAt: true },
        }),
      ])
    : [[], []];

  const group = <T extends { userId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.userId);
      if (list) list.push(r);
      else m.set(r.userId, [r]);
    }
    return m;
  };
  const tripsBy = group(trips);
  const shiftsBy = group(shifts);
  const approvalStart = await earliestApprovalMonths(orgId, toldIds);
  const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { createdByUserId: true, createdAt: true } });

  const drivers: TeamDriverDays[] = withUser.map((m) => {
    const uid = m.userId!;
    const isTold = told.has(uid);
    const fromDate = teamStartDate(
      m.acceptedAt,
      approvalStart.get(uid) ?? null,
      org && org.createdByUserId === uid ? org.createdAt : null
    );
    const days =
      isTold && fromDate
        ? buildDrivingDays(tripsBy.get(uid) ?? [], shiftsBy.get(uid) ?? [], { month, fromDate })
        : [];
    return {
      userId: uid,
      displayName: m.user?.displayName ?? null,
      email: m.user?.email ?? "",
      told: isTold,
      days,
    };
  });
  return { month, drivers };
}
