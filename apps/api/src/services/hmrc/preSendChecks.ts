// "Check before you send" figures for the quarterly update screen.
//
// Advice only: these never change what is sent to HMRC and never block it.
// They are computed here, with date-ranged queries, so they agree with the
// figures being sent (the phone only keeps a recent window of trips and
// earnings, which would give false "no earnings" weeks after a reinstall).

import type { PrismaClient } from "@prisma/client";
import { claimableWhere } from "../../lib/claimableTrips.js";

export interface PreSendChecks {
  /** Trips in the period not yet marked Business or Personal. */
  unmarkedTrips: number;
  /** Mondays (YYYY-MM-DD) of weeks with Business trips and no earnings. Null when not applicable to this driver. */
  weeksMissingEarnings: string[] | null;
}

const LONDON_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD of an instant on the UK calendar. */
export function londonDay(d: Date): string {
  return LONDON_DAY.format(d);
}

function utcNoon(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week holding the day. */
export function weekStartOf(day: string): string {
  const d = utcNoon(day);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return dayOf(d);
}

function addDays(day: string, n: number): string {
  const d = utcNoon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayOf(d);
}

/**
 * Weeks (Mondays, oldest first) containing a Business trip day and no
 * earnings range overlapping any day of that week.
 */
export function weeksMissingEarnings(
  businessTripDays: string[],
  earningRanges: { start: string; end: string }[],
): string[] {
  const weeks = new Set(businessTripDays.map(weekStartOf));
  const missing: string[] = [];
  for (const wk of Array.from(weeks).sort()) {
    const wkEnd = addDays(wk, 6);
    if (!earningRanges.some((r) => r.start <= wkEnd && r.end >= wk)) missing.push(wk);
  }
  return missing;
}

/** Only self-employed drivers get the earnings-by-week check. */
export function isSelfEmployedWorkType(workType: string | null | undefined): boolean {
  return workType === "gig" || workType === "both";
}

export async function computePreSendChecks(args: {
  prisma: PrismaClient;
  userId: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
}): Promise<PreSendChecks> {
  const { prisma, userId, from, to } = args;
  // A day either side, then trimmed to the UK calendar below.
  const gte = new Date(`${addDays(from, -1)}T00:00:00Z`);
  const lt = new Date(`${addDays(to, 2)}T00:00:00Z`);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { workType: true } });
  const selfEmployed = isSelfEmployedWorkType(user?.workType);

  const unmarkedStarts = await prisma.trip.findMany({
    where: claimableWhere({
      userId,
      classification: "unclassified",
      isPhantomTrip: false,
      startedAt: { gte, lt },
    }),
    select: { startedAt: true },
  });
  const unmarkedTrips = unmarkedStarts.filter((t) => {
    const d = londonDay(t.startedAt);
    return d >= from && d <= to;
  }).length;

  if (!selfEmployed) return { unmarkedTrips, weeksMissingEarnings: null };

  const [trips, earnings] = await Promise.all([
    prisma.trip.findMany({
      where: claimableWhere({
        userId,
        classification: "business",
        isPhantomTrip: false,
        startedAt: { gte, lt },
      }),
      select: { startedAt: true },
    }),
    prisma.earning.findMany({
      where: { userId, periodEnd: { gte: new Date(`${from}T00:00:00Z`) }, periodStart: { lte: new Date(`${to}T00:00:00Z`) } },
      select: { periodStart: true, periodEnd: true },
    }),
  ]);

  const days = trips.map((t) => londonDay(t.startedAt)).filter((d) => d >= from && d <= to);
  return {
    unmarkedTrips,
    weeksMissingEarnings: weeksMissingEarnings(
      days,
      earnings.map((e) => ({ start: dayOf(e.periodStart), end: dayOf(e.periodEnd) })),
    ),
  };
}
