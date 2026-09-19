// A phone extending a trip the server has already split.
//
// autoSplitVisitWelds keeps the parent's id as leg ONE on purpose: the phone
// still holds the whole recording under that id and addresses later PATCHes
// to it. But when the phone then folds a new drive into "its" trip (the merge
// path: new breadcrumbs, a later endedAt, a new end point), the handler used
// to write all of that onto leg one. Leg one's end jumped past every later
// leg, so it overlapped them, and its trail distance picked up a straight line
// from the first stop to the new driving.
//
// Sonny Grant, 19 Sep 2026: a 14:33 drive was saved at 15:15 and split into
// 7.07 + 5.16 + 2.18 miles. The phone then appended a 15:28 drive to the
// parent, which became 14:33-15:34 and 14.48 miles, on top of the two legs it
// had just given away: 21.8 miles recorded for about 14 driven.
//
// The extension belongs after the LAST leg, so that is where it goes. Every
// other field in the PATCH (classification, notes, vehicle) still lands on the
// parent the phone named.
//
// The pure plan lives here so it can be tested without a database.

import { prisma } from "../lib/prisma.js";
import { trailDistanceMiles } from "./tripSplit.js";

export interface IncomingCoordinate {
  lat: number;
  lng: number;
  speed?: number | null;
  accuracy?: number | null;
  recordedAt: Date;
}

export interface SplitFamily {
  /** The parent and every trip split from it, at any depth. */
  familyIds: string[];
  /** The leg that starts last: where new driving is appended. */
  tailId: string;
}

/** Deep enough for any real day; stops a malformed chain from looping. */
const MAX_FAMILY_DEPTH = 10;

/**
 * The trips the server has split out of `tripId`, followed down the chain
 * (a leg can be split again by a later sweep). Null when the trip was never
 * split, which is almost always.
 */
export async function findSplitFamily(userId: string, tripId: string): Promise<SplitFamily | null> {
  const members: Array<{ id: string; startedAt: Date }> = [];
  let frontier = [tripId];
  for (let depth = 0; depth < MAX_FAMILY_DEPTH && frontier.length > 0; depth++) {
    const children = await prisma.trip.findMany({
      where: {
        userId,
        OR: frontier.map((id) => ({ gpsQuality: { path: "$.autoSplitFromTripId", equals: id } })),
      },
      select: { id: true, startedAt: true },
    });
    const fresh = children.filter((c) => c.id !== tripId && !members.some((m) => m.id === c.id));
    members.push(...fresh);
    frontier = fresh.map((c) => c.id);
  }
  if (members.length === 0) return null;
  const tail = members.reduce((a, b) => (b.startedAt.getTime() > a.startedAt.getTime() ? b : a));
  return { familyIds: [tripId, ...members.map((m) => m.id)], tailId: tail.id };
}

export interface TailAppendPlan {
  /** Breadcrumbs to write onto the tail, oldest first. */
  fresh: IncomingCoordinate[];
  /** Already held somewhere in the family: a replayed PATCH. */
  duplicates: number;
  /** Older than the tail's first breadcrumb, so they belong to no leg's end. */
  beforeTail: number;
  /** Miles from the tail's last breadcrumb through the fresh ones. */
  addedMiles: number;
}

/**
 * What to write onto the tail. Dedup is against the WHOLE family, because a
 * split moves breadcrumbs out of the parent: a replay deduped against the
 * parent alone re-adds every point that now lives in a later leg.
 */
export function planTailAppend(args: {
  incoming: IncomingCoordinate[];
  familyTimes: Set<number>;
  tailStartedAt: Date;
  tailLast: { lat: number; lng: number } | null;
}): TailAppendPlan {
  const { incoming, familyTimes, tailStartedAt, tailLast } = args;
  const seen = new Set(familyTimes);
  const fresh: IncomingCoordinate[] = [];
  let duplicates = 0;
  let beforeTail = 0;
  for (const c of incoming) {
    const t = c.recordedAt.getTime();
    if (seen.has(t)) {
      duplicates++;
      continue;
    }
    if (t < tailStartedAt.getTime()) {
      beforeTail++;
      continue;
    }
    seen.add(t);
    fresh.push(c);
  }
  fresh.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const addedMiles =
    fresh.length > 0 ? trailDistanceMiles([...(tailLast ? [tailLast] : []), ...fresh]) : 0;
  return { fresh, duplicates, beforeTail, addedMiles };
}

export interface TailAppendResult {
  tailId: string;
  appended: number;
  duplicates: number;
  beforeTail: number;
  addedMiles: number;
}

/**
 * Append a merge's breadcrumbs to the family's last leg and move that leg's
 * end. The tail keeps its recorded miles and gains the new stretch, the same
 * "extend, never re-route" rule as an end-pin move.
 */
export async function appendToSplitTail(args: {
  userId: string;
  family: SplitFamily;
  coordinates: IncomingCoordinate[];
  endAddress?: string | null;
}): Promise<TailAppendResult> {
  const { family, coordinates, endAddress } = args;

  return prisma.$transaction(async (tx) => {
    const tail = await tx.trip.findUniqueOrThrow({
      where: { id: family.tailId },
      select: { id: true, startedAt: true, endedAt: true, distanceMiles: true },
    });
    const held = await tx.tripCoordinate.findMany({
      where: { tripId: { in: family.familyIds } },
      select: { recordedAt: true },
    });
    const tailLast = await tx.tripCoordinate.findFirst({
      where: { tripId: tail.id },
      orderBy: { recordedAt: "desc" },
      select: { lat: true, lng: true },
    });

    const plan = planTailAppend({
      incoming: coordinates,
      familyTimes: new Set(held.map((c) => c.recordedAt.getTime())),
      tailStartedAt: tail.startedAt,
      tailLast,
    });

    if (plan.fresh.length > 0) {
      await tx.tripCoordinate.createMany({
        data: plan.fresh.map((c) => ({
          tripId: tail.id,
          lat: c.lat,
          lng: c.lng,
          speed: c.speed ?? null,
          accuracy: c.accuracy ?? null,
          recordedAt: c.recordedAt,
        })),
      });
      const last = plan.fresh[plan.fresh.length - 1];
      const endedAt =
        tail.endedAt && tail.endedAt.getTime() > last.recordedAt.getTime() ? tail.endedAt : last.recordedAt;
      await tx.trip.update({
        where: { id: tail.id },
        data: {
          coordinateCount: { increment: plan.fresh.length },
          distanceMiles: Math.round((tail.distanceMiles + plan.addedMiles) * 100) / 100,
          endedAt,
          endLat: last.lat,
          endLng: last.lng,
          // The old end address named where the tail used to stop. The phone's
          // name for the new end wins; otherwise the geocode job fills it.
          endAddress: endAddress ?? null,
          routePolyline: null,
        },
      });
    }

    return {
      tailId: tail.id,
      appended: plan.fresh.length,
      duplicates: plan.duplicates,
      beforeTail: plan.beforeTail,
      addedMiles: plan.addedMiles,
    };
  });
}
