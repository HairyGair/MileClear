import type { TeamDriverDays, TeamDrivingDay, TeamMonthDays } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { londonMonthBounds } from "./teamExport.js";

// Milesheet driving times (Oct 2026).
//
// Rob Lyons (Maids Of Glory) asked for his drivers' start and finish times
// for payroll. Most Milesheet drivers never press Start Shift, but their
// business trips mark out a working day, so each UK-local day shows the
// start of the first business drive and the end of the last. When the
// driver did record a shift that day, the shift's own start and end are
// used instead. This is driving times, not hours worked, and every place it
// is shown says so.
//
// A manager only sees a driver's times once that driver has been told
// (isDriverToldAboutTimes below).

export const DRIVING_TIMES_LABEL = "Driving times: first drive to last drive. Not hours worked.";

/** App event recorded per driver when the notice email has gone to them. */
export const DRIVING_TIMES_NOTICE_EVENT = "team.driving_times_notice";

/**
 * Drivers who joined their team on or after this moment saw the consent
 * line "Your manager can also see when your business drives start and
 * finish each day." when they accepted. Set to the day this ships
 * (19 October 2026, 00:00 London). If it ships later, move this to the
 * deploy day: a date that is too early would count drivers as told who
 * never saw the line.
 */
export const DRIVING_TIMES_NOTICE_FROM = new Date("2026-10-18T23:00:00.000Z");

/** The notice gate. Pure so it can be pinned by tests. */
export function isDriverToldAboutTimes(
  membership: { acceptedAt: Date | null },
  hasNoticeEvent: boolean,
  noticeFrom: Date = DRIVING_TIMES_NOTICE_FROM
): boolean {
  if (hasNoticeEvent) return true;
  return membership.acceptedAt != null && membership.acceptedAt.getTime() >= noticeFrom.getTime();
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
 * Builds one row per London day from a driver's business trips and shifts.
 *
 * - A trip or shift belongs to the day it STARTED, even if it ends after
 *   midnight (endsNextDay is then true).
 * - A day with a completed shift takes the shift's start and end (earliest
 *   start, latest end when there are several) and is marked "shift"; trips
 *   on that day are still counted.
 * - A shift still running (no endedAt) is ignored, so the day falls back to
 *   its trips until the shift ends.
 * - A trip with no endedAt counts as ending when it started.
 * - Callers pass only business, non-phantom trips. Days outside `month`
 *   (if given) are dropped.
 */
export function buildDrivingDays(
  trips: DrivingInterval[],
  shifts: DrivingInterval[],
  month?: string
): TeamDrivingDay[] {
  type Acc = { tripStart?: number; tripEnd?: number; trips: number; shiftStart?: number; shiftEnd?: number };
  const byDay = new Map<string, Acc>();
  const acc = (date: string): Acc => {
    let a = byDay.get(date);
    if (!a) {
      a = { trips: 0 };
      byDay.set(date, a);
    }
    return a;
  };

  for (const t of trips) {
    const s = t.startedAt.getTime();
    if (!Number.isFinite(s)) continue;
    const e = Math.max(s, t.endedAt ? t.endedAt.getTime() : s);
    const a = acc(londonDate(t.startedAt));
    a.trips++;
    a.tripStart = a.tripStart === undefined ? s : Math.min(a.tripStart, s);
    a.tripEnd = a.tripEnd === undefined ? e : Math.max(a.tripEnd, e);
  }

  for (const sh of shifts) {
    if (!sh.endedAt) continue;
    const s = sh.startedAt.getTime();
    const e = sh.endedAt.getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;
    const a = acc(londonDate(sh.startedAt));
    a.shiftStart = a.shiftStart === undefined ? s : Math.min(a.shiftStart, s);
    a.shiftEnd = a.shiftEnd === undefined ? e : Math.max(a.shiftEnd, e);
  }

  const days: TeamDrivingDay[] = [];
  for (const [date, a] of byDay) {
    if (month && !date.startsWith(`${month}-`)) continue;
    const useShift = a.shiftStart !== undefined && a.shiftEnd !== undefined;
    const start = useShift ? a.shiftStart! : a.tripStart;
    const end = useShift ? a.shiftEnd! : a.tripEnd;
    if (start === undefined || end === undefined) continue;
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
      source: useShift ? "shift" : "trips",
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
 * (their trips are not even read).
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
  const userIds = memberships.map((m) => m.userId!).filter(Boolean);
  if (userIds.length === 0) return { month, drivers: [] };

  const notices = await prisma.appEvent.findMany({
    where: { type: DRIVING_TIMES_NOTICE_EVENT, userId: { in: userIds } },
    select: { userId: true, metadata: true },
  });
  const noticed = new Set(
    notices
      .filter((n) => (n.metadata as { orgId?: unknown } | null)?.orgId === orgId)
      .map((n) => n.userId!)
  );

  const told = new Set(
    memberships.filter((m) => isDriverToldAboutTimes(m, noticed.has(m.userId!))).map((m) => m.userId!)
  );
  const toldIds = [...told];

  const [trips, shifts] = toldIds.length
    ? await Promise.all([
        prisma.trip.findMany({
          where: {
            userId: { in: toldIds },
            classification: "business",
            isPhantomTrip: false,
            startedAt: { gte: start, lt: end },
          },
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

  const drivers: TeamDriverDays[] = memberships.map((m) => {
    const uid = m.userId!;
    const isTold = told.has(uid);
    return {
      userId: uid,
      displayName: m.user?.displayName ?? null,
      email: m.user?.email ?? "",
      told: isTold,
      days: isTold ? buildDrivingDays(tripsBy.get(uid) ?? [], shiftsBy.get(uid) ?? [], month) : [],
    };
  });
  return { month, drivers };
}
