// Automatic visit splitting.
//
// Under the native engine a recording ends only when RNBG declares the phone
// stationary. A driver who parks, gets out and walks about never triggers
// that — CoreMotion still sees motion — so a round of client visits arrives
// as one long trip with the visits buried inside it. Build 85's gap-stop
// covers the narrow case where the phone also went silent AND woke within
// 250 m; it does not cover a visit the phone stayed awake through, and it
// does not cover a wake 500 m down the road, which is the usual shape.
//
// This job re-reads recently arrived trips and cuts them at the visits, using
// the same dwell detector as the user-confirmed Trip Split, at a threshold
// tuned so that only a real stop clears it (services/tripSplit.ts,
// planAutoSplit). No breadcrumb is created or destroyed: each one is
// re-attributed to the leg it was recorded on.
//
// WHY A JOB AND NOT THE TRIP-CREATE PATH: a trip can keep growing after it is
// saved (PATCH /trips/:id appends coordinates, sometimes a day later on a
// device that was offline). Splitting the moment it arrives would race that.
// Here it settles first, and the append path re-runs the split itself so a
// trip that grows a new visit gets cut again.
//
// Set VISIT_AUTO_SPLIT_ENABLED=0 to stop it without a deploy.

import { prisma } from "../lib/prisma.js";
import { autoSplitVisitWelds, type AutoSplitResult } from "../services/tripSplit.js";
import { logEvent } from "../services/appEvents.js";

/** Give the device time to finish appending before judging the shape. */
const SETTLE_MIN = 30;
/** Reach back further than the tick so a missed run self-heals; trips are
 *  claimed by creation time, so an offline device syncing yesterday's driving
 *  is caught when it arrives rather than when it happened. */
const WINDOW_MIN = 75;
const DEFAULT_LIMIT = 300;

export interface VisitSplitResult {
  scanned: number;
  split: number;
  legsCreated: number;
  /** Miles that stopped counting as driving: shuffling about at the stops. */
  milesReleased: number;
  splits: AutoSplitResult[];
}

export interface VisitSplitOptions {
  /** Restrict to one user — support backfills and the first live run. */
  userId?: string;
  /** Override the creation window, in minutes back from now. */
  sinceMin?: number;
  untilMin?: number;
  limit?: number;
  /** Plan the cuts and report them without touching anything. */
  dryRun?: boolean;
}

export function visitAutoSplitEnabled(): boolean {
  return process.env.VISIT_AUTO_SPLIT_ENABLED !== "0";
}

export async function runVisitSplit(
  opts: VisitSplitOptions = {}
): Promise<VisitSplitResult> {
  const {
    userId,
    sinceMin = WINDOW_MIN,
    untilMin = SETTLE_MIN,
    limit = DEFAULT_LIMIT,
    dryRun = false,
  } = opts;

  const now = Date.now();
  const candidates = await prisma.trip.findMany({
    where: {
      ...(userId ? { userId } : {}),
      isManualEntry: false,
      isPhantomTrip: false,
      endedAt: { not: null },
      createdAt: {
        gte: new Date(now - sinceMin * 60 * 1000),
        lte: new Date(now - untilMin * 60 * 1000),
      },
    },
    select: { id: true, userId: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const result: VisitSplitResult = {
    scanned: candidates.length,
    split: 0,
    legsCreated: 0,
    milesReleased: 0,
    splits: [],
  };

  for (const trip of candidates) {
    try {
      const split = await autoSplitVisitWelds({
        userId: trip.userId,
        tripId: trip.id,
        dryRun,
      });
      if (!split) continue;
      result.split += 1;
      result.legsCreated += split.legs - 1;
      result.milesReleased += split.milesBefore - split.milesAfter;
      result.splits.push(split);
    } catch (err) {
      // One malformed trail must not stop the sweep.
      logEvent("trip.visit_auto_split_failed", trip.userId, {
        tripId: trip.id,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  result.milesReleased = Math.round(result.milesReleased * 100) / 100;
  return result;
}

export async function runVisitSplitJob(): Promise<void> {
  if (!visitAutoSplitEnabled()) {
    console.log("[jobs/visitSplit] disabled by VISIT_AUTO_SPLIT_ENABLED=0");
    return;
  }
  const result = await runVisitSplit();
  console.log(
    `[jobs/visitSplit] scanned ${result.scanned}, split ${result.split} into ` +
      `${result.split + result.legsCreated} legs, released ${result.milesReleased} mi`
  );
}
