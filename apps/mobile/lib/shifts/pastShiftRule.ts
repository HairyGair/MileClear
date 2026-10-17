// Rules for the "Add a past shift" screen (Oct 2026). A gig driver asked to
// add a whole earlier work session in one go instead of one trip at a time.
//
// The form holds the shift's start and end, a car, a list of trips and an
// optional earning. Each new trip follows on from the one before, the way
// "Add the next trip" does on the trip form (pastTripRule.chainParams): it
// sets off where the last one arrived, when it arrived, for the same app.
// What counts as a valid shift is shared with the server
// (@mileclear/shared pastShiftProblem), so the two agree.
//
// Pure: no React, no database, no clock (callers pass `now`).

import { pastShiftProblem, windowCoveringTrips, firstOverlappingTrip } from "@mileclear/shared";
import { endTimeFor } from "../trips/missingReportRule";
import { clockTime } from "../trips/manualTimeRule";

export type RouteState = "idle" | "working" | "done" | "failed";

export interface DraftTrip {
  key: string;
  fromLat: number | null;
  fromLng: number | null;
  fromAddress: string | null;
  toLat: number | null;
  toLng: number | null;
  toAddress: string | null;
  setOffAt: Date | null;
  /** Road miles, from the same route lookup the trip form uses. */
  miles: number | null;
  /** The route's drive time, for when the trip arrives. */
  routedSecs: number | null;
  route: RouteState;
  platformTag: string | null;
}

export function emptyTrip(key: string): DraftTrip {
  return {
    key,
    fromLat: null,
    fromLng: null,
    fromAddress: null,
    toLat: null,
    toLng: null,
    toAddress: null,
    setOffAt: null,
    miles: null,
    routedSecs: null,
    route: "idle",
    platformTag: null,
  };
}

/** When the trip arrives: set-off plus the route's drive time (the trip
 *  form's rule, missingReportRule.endTimeFor). Null until both are known. */
export function arrivalFor(t: DraftTrip, now: number): Date | null {
  if (!t.setOffAt || t.route !== "done") return null;
  return endTimeFor({ departAt: t.setOffAt, routedSecs: t.routedSecs, typedMiles: t.miles, now });
}

/**
 * The next trip, following on from `prev`: from where it arrived, setting
 * off when it arrived, for the same app. The first trip sets off when the
 * shift started.
 */
export function chainedTrip(prev: DraftTrip | null, shiftStart: Date | null, key: string, now: number): DraftTrip {
  const t = emptyTrip(key);
  if (!prev) {
    t.setOffAt = shiftStart;
    return t;
  }
  t.fromLat = prev.toLat;
  t.fromLng = prev.toLng;
  t.fromAddress = prev.toAddress;
  t.setOffAt = arrivalFor(prev, now) ?? prev.setOffAt;
  t.platformTag = prev.platformTag;
  return t;
}

/**
 * What the Save button says while it can't be pressed, or null when the
 * shift can be saved. One plain ask, the first thing missing.
 */
export function missingForPastShift(args: {
  shiftStart: Date | null;
  shiftEnd: Date | null;
  trips: DraftTrip[];
}): string | null {
  if (!args.shiftStart) return "Add when the shift started";
  if (!args.shiftEnd) return "Add when the shift ended";
  if (args.trips.length === 0) return "Add a trip";
  for (let i = 0; i < args.trips.length; i++) {
    const t = args.trips[i];
    const n = i + 1;
    if (t.fromLat == null || t.fromLng == null) return `Add where trip ${n} set off from`;
    if (t.toLat == null || t.toLng == null) return `Add where trip ${n} went`;
    if (!t.setOffAt) return `Add when trip ${n} set off`;
    if (t.route === "working" || t.route === "idle") return `Working out the miles for trip ${n}`;
    if (t.route === "failed") return `Couldn't work out the miles for trip ${n}`;
  }
  return null;
}

/** "Trip 2 sets off before trip 1 arrives." for trips that run into each
 *  other, or null. Trips in a shift follow on from one another. */
export function tripsRunIntoEachOther(trips: DraftTrip[], now: number): string | null {
  const spans = trips.map((t, i) => ({
    id: String(i),
    startedAt: t.setOffAt ?? new Date(Number.NaN),
    endedAt: arrivalFor(t, now),
  }));
  for (let i = 1; i < spans.length; i++) {
    const s = spans[i];
    if (!Number.isFinite(s.startedAt.getTime())) continue;
    const hit = firstOverlappingTrip(spans.slice(0, i), s.startedAt, s.endedAt);
    if (hit) return `Trip ${i + 1} sets off before trip ${Number(hit.id) + 1} arrives.`;
  }
  return null;
}

export interface ShiftWindowPlan {
  startedAt: Date;
  endedAt: Date;
  /** The window was stretched to hold the trips. */
  stretched: boolean;
  /** What to tell the driver before saving when it was stretched. */
  message: string | null;
}

/**
 * The shift times that will be saved: the ones given, or stretched to hold
 * every trip, with a plain message saying so.
 */
export function planShiftWindow(args: {
  shiftStart: Date;
  shiftEnd: Date;
  trips: DraftTrip[];
  now: number;
}): ShiftWindowPlan {
  const times = args.trips
    .filter((t) => t.setOffAt)
    .map((t) => ({ startedAt: t.setOffAt as Date, endedAt: arrivalFor(t, args.now) }));
  const w = windowCoveringTrips(args.shiftStart, args.shiftEnd, times);
  const stretched =
    w.startedAt.getTime() !== args.shiftStart.getTime() || w.endedAt.getTime() !== args.shiftEnd.getTime();
  return {
    startedAt: w.startedAt,
    endedAt: w.endedAt,
    stretched,
    message: stretched
      ? `Your trips run outside the shift times you set, so the shift will be saved as ${clockTime(w.startedAt)} to ${clockTime(w.endedAt)}.`
      : null,
  };
}

export interface PastShiftBody {
  startedAt: string;
  endedAt: string;
  vehicleId?: string;
  trips: Array<{
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    startAddress?: string;
    endAddress?: string;
    distanceMiles?: number;
    startedAt: string;
    endedAt?: string;
    platformTag?: string;
  }>;
  earning?: { platform: string; amountPence: number };
}

/** "64.50", "£64.50", "64,5" -> 6450 pence. Null for anything else or nothing. */
export function parseAmountPence(text: string): number | null {
  const cleaned = text.trim().replace(/^£\s*/, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number(cleaned) * 100);
  return pence > 0 && pence <= 10_000_000 ? pence : null;
}

/**
 * The request for POST /shifts/past, or the reason it can't be sent yet.
 * Runs the shared rules on what will actually be sent (after stretching).
 */
export function buildPastShiftBody(args: {
  shiftStart: Date | null;
  shiftEnd: Date | null;
  vehicleId: string | null;
  trips: DraftTrip[];
  earningText: string;
  earningPlatform: string | null;
  now: number;
}): { body: PastShiftBody; plan: ShiftWindowPlan } | { problem: string } {
  const missing = missingForPastShift({ shiftStart: args.shiftStart, shiftEnd: args.shiftEnd, trips: args.trips });
  if (missing) return { problem: missing };
  const shiftStart = args.shiftStart as Date;
  const shiftEnd = args.shiftEnd as Date;
  if (shiftEnd.getTime() <= shiftStart.getTime()) return { problem: "The shift has to end after it starts." };
  // Named before the window is stretched, which would otherwise report it as
  // a shift that ends after now.
  const future = args.trips.findIndex((t) => (t.setOffAt as Date).getTime() > args.now);
  if (future >= 0) return { problem: `Trip ${future + 1} is later than now.` };
  const runInto = tripsRunIntoEachOther(args.trips, args.now);
  if (runInto) return { problem: runInto };

  let earning: PastShiftBody["earning"];
  if (args.earningText.trim()) {
    const pence = parseAmountPence(args.earningText);
    if (pence == null) return { problem: "Check the amount earned, for example 64.50." };
    if (!args.earningPlatform) return { problem: "Pick which app the earnings are from." };
    earning = { platform: args.earningPlatform, amountPence: pence };
  }

  const plan = planShiftWindow({ shiftStart, shiftEnd, trips: args.trips, now: args.now });
  const trips = args.trips.map((t) => {
    const arrival = arrivalFor(t, args.now);
    return {
      startLat: t.fromLat as number,
      startLng: t.fromLng as number,
      endLat: t.toLat as number,
      endLng: t.toLng as number,
      ...(t.fromAddress ? { startAddress: t.fromAddress } : {}),
      ...(t.toAddress ? { endAddress: t.toAddress } : {}),
      ...(t.miles != null ? { distanceMiles: Math.round(t.miles * 100) / 100 } : {}),
      startedAt: (t.setOffAt as Date).toISOString(),
      ...(arrival ? { endedAt: arrival.toISOString() } : {}),
      ...(t.platformTag ? { platformTag: t.platformTag } : {}),
    };
  });

  const problem = pastShiftProblem({
    startedAt: plan.startedAt,
    endedAt: plan.endedAt,
    trips: trips.map((t) => ({ startedAt: new Date(t.startedAt), endedAt: t.endedAt ? new Date(t.endedAt) : null })),
    now: args.now,
  });
  if (problem) return { problem };

  return {
    body: {
      startedAt: plan.startedAt.toISOString(),
      endedAt: plan.endedAt.toISOString(),
      ...(args.vehicleId ? { vehicleId: args.vehicleId } : {}),
      trips,
      ...(earning ? { earning } : {}),
    },
    plan,
  };
}

/** The app most of the trips were for, to start the earnings on. */
export function mostUsedPlatform(trips: DraftTrip[]): string | null {
  const counts = new Map<string, number>();
  for (const t of trips) if (t.platformTag) counts.set(t.platformTag, (counts.get(t.platformTag) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [p, n] of counts) {
    if (n > bestN) {
      best = p;
      bestN = n;
    }
  }
  return best;
}
