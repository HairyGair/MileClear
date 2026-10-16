/**
 * recordedOverlap: trim the fixes of an incoming recording that the driver
 * already has saved on another trip.
 *
 * recordedDuplicate.ts only refuses a recording that is almost ALL copy. The
 * Android doubling (15 Oct 2026, e84b24f3: one 15:32-16:00 stretch held by
 * four trips) is the other shape: the phone re-sends fixes it already saved
 * plus a real continuation, so the whole thing is under the 90% bar and is
 * stored, and that stretch is counted twice. 101 overlapping pairs on 14 of
 * 181 Android drivers in 14 days, about 286 miles.
 *
 * Which trips are "keepers" is decided on proof: another trip that holds at
 * least 5 fixes at the SAME millisecond and within 50 m of the incoming ones.
 * Two phones, or one phone on two drives, cannot do that by chance.
 *
 * What is "covered" is wider, because the real shape is ragged (a prod dry run,
 * 16 Oct): a keeper rarely holds every fix of the stretch it overlaps, it has
 * gaps. So a fix is covered if it is exact-shared OR its time lies inside a
 * keeper's own start-to-end. What is left are stretches only the incoming trip
 * recorded. A stretch under 0.3 mi (counting the segment that joins it to the
 * covered fix beside it) is noise at the seams; a stretch of 0.3 mi or more is
 * real driving. No real stretch: the trip is a copy. Exactly one: trim to it.
 * Two or more: leave it alone.
 *
 * Pure: the route loads the other trips' fixes and applies the plan.
 */
import { haversineDistance } from "@mileclear/shared";

export interface OverlapFix {
  /** recordedAt, epoch ms */
  t: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
}

export interface OverlapOtherTrip {
  id: string;
  shiftId: string | null;
  fixes: OverlapFix[];
  /** The trip's own startedAt / endedAt (epoch ms). Loaded fixes are only the
   *  ones inside the incoming range, so the real span must come from the row.
   *  Defaults to the first and last loaded fix. */
  spanFrom?: number | null;
  spanTo?: number | null;
}

/** Same millisecond AND this close. GPS error is a few metres and the same
 *  fix stored twice is identical; 50 m only absorbs a re-projected copy. */
export const OVERLAP_MATCH_RADIUS_M = 50;
/** A keeper shares at least this many fixes. One shared boundary fix is just
 *  two recordings meeting where one ended and the next began. */
export const OVERLAP_MIN_SHARED_FIXES = 5;
/** ...and the keepers share at least this share of the incoming fixes. Below a
 *  tenth the doubled stretch is small and leaving today's behaviour alone costs
 *  less than rewriting a trip on thin evidence. */
export const OVERLAP_MIN_SHARE = 0.1;
/** A stretch only the incoming trip recorded is real from this many miles
 *  (its own path plus the segment joining it to the covered fix beside it)
 *  and this many fixes of its own. */
export const OVERLAP_REAL_STRETCH_MILES = 0.3;
export const OVERLAP_REAL_STRETCH_FIXES = 2;

/** The phone's planted departure anchor: accuracy exactly 50, speed 0. It is
 *  where the car was parked, not a measured fix, and two trips leaving the same
 *  spot can both carry one, so it never counts as shared, and it neither breaks
 *  a stretch nor makes one. */
export function isAnchorShaped(f: { accuracy: number | null; speed: number | null }): boolean {
  return f.accuracy === 50 && f.speed === 0;
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineDistance(a.lat, a.lng, b.lat, b.lng) * 1609.344;
}

/** Keep the first fix of each exact millisecond; returns the time-sorted list. */
export function dedupeByTimestamp<T extends { t: number }>(fixes: T[]): { fixes: T[]; removed: number } {
  const sorted = fixes
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => Number.isFinite(f.t))
    .sort((a, b) => a.f.t - b.f.t || a.i - b.i);
  const out: T[] = [];
  let last = NaN;
  for (const { f } of sorted) {
    if (f.t === last) continue;
    out.push(f);
    last = f.t;
  }
  return { fixes: out, removed: fixes.length - out.length };
}

/** Haversine sum, the same basis as the server's other trail figures
 *  (tripSplit.legDistanceMiles), rounded to 2 dp. */
export function trailMiles(fixes: Array<{ lat: number; lng: number }>): number {
  let miles = 0;
  for (let i = 1; i < fixes.length; i++) {
    miles += haversineDistance(fixes[i - 1].lat, fixes[i - 1].lng, fixes[i].lat, fixes[i].lng);
  }
  return Math.round(miles * 100) / 100;
}

export type OverlapVerdict = "none" | "trim" | "refuse" | "multi";

export interface OverlapPlan {
  verdict: OverlapVerdict;
  /** Why "none", or why "refuse". */
  reason: string | null;
  /** Incoming fixes after the timestamp dedupe, time-sorted. */
  fixes: OverlapFix[];
  duplicateTimestamps: number;
  /** Fixes shared at the exact millisecond with a keeper. */
  sharedFixes: number;
  /** Keepers (>= 5 exact-shared fixes), most first. */
  keptTripIds: string[];
  /** The keeper holding most of the shared fixes. */
  bestTripId: string | null;
  /** Stretches only the incoming trip recorded, real or not. */
  stretches: number;
  realStretches: number;
  /** trim: the small stretches dropped with the covered fixes. */
  droppedSmallStretches: number;
  droppedSmallMiles: number;
  /** trim: what is left to save (real stretch plus its joining fix(es)). */
  remainder: OverlapFix[];
  remainderMiles: number;
  fromMiles: number;
}

/**
 * Decide what to do with an incoming recording given the driver's other trips
 * that overlap it in time.
 *
 * trim: exactly one real stretch. The remainder is that stretch plus the
 *   covered fix beside it on each side it touches, so the joining segments
 *   keep their distance; small stretches and covered fixes are dropped.
 * refuse: no real stretch (answer as the 90% refusal does).
 * multi: two or more real stretches; the caller saves whole.
 * none: no meaningful overlap, or a rule says leave it to today's behaviour.
 */
export function planOverlapTrim(args: {
  incoming: OverlapFix[];
  others: OverlapOtherTrip[];
  incomingHasShift: boolean;
}): OverlapPlan {
  const { fixes, removed } = dedupeByTimestamp(args.incoming);
  const base: OverlapPlan = {
    verdict: "none",
    reason: null,
    fixes,
    duplicateTimestamps: removed,
    sharedFixes: 0,
    keptTripIds: [],
    bestTripId: null,
    stretches: 0,
    realStretches: 0,
    droppedSmallStretches: 0,
    droppedSmallMiles: 0,
    remainder: [],
    remainderMiles: 0,
    fromMiles: trailMiles(fixes),
  };
  if (fixes.length < 2) return { ...base, reason: "too_few_fixes" };

  // Index the other trips' fixes by millisecond. Anchor-shaped ones are left out.
  const byTime = new Map<number, Array<{ tripId: string; fix: OverlapFix }>>();
  for (const o of args.others) {
    for (const g of o.fixes) {
      if (!Number.isFinite(g.t) || isAnchorShaped(g)) continue;
      const list = byTime.get(g.t);
      if (list) list.push({ tripId: o.id, fix: g });
      else byTime.set(g.t, [{ tripId: o.id, fix: g }]);
    }
  }
  const matches = (f: OverlapFix): string[] => {
    if (isAnchorShaped(f)) return [];
    return (byTime.get(f.t) ?? []).filter((m) => metres(f, m.fix) <= OVERLAP_MATCH_RADIUS_M).map((m) => m.tripId);
  };

  // Keepers: trips sharing at least OVERLAP_MIN_SHARED_FIXES.
  const perTrip = new Map<string, number>();
  for (const f of fixes) for (const id of matches(f)) perTrip.set(id, (perTrip.get(id) ?? 0) + 1);
  const ranked = [...perTrip]
    .filter(([, n]) => n >= OVERLAP_MIN_SHARED_FIXES)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const keeperIds = new Set(ranked);
  const exact = fixes.map((f) => matches(f).some((id) => keeperIds.has(id)));
  const sharedCount = exact.filter(Boolean).length;
  const info: OverlapPlan = { ...base, sharedFixes: sharedCount, keptTripIds: ranked, bestTripId: ranked[0] ?? null };
  if (ranked.length === 0 || sharedCount / fixes.length < OVERLAP_MIN_SHARE) {
    return { ...info, reason: "shared_too_few" };
  }

  // A shift's recording is never trimmed against a trip that is not on the
  // shift: the shift scorecard must keep counting the drive. Today's rules apply.
  const keepers = args.others.filter((o) => keeperIds.has(o.id));
  if (args.incomingHasShift && keepers.some((o) => !o.shiftId)) return { ...info, reason: "shift_vs_unshifted" };

  // Time spans of the keepers.
  const spans = keepers.map((o) => {
    const ts = o.fixes.map((g) => g.t).filter(Number.isFinite);
    return {
      from: o.spanFrom ?? (ts.length ? Math.min(...ts) : Infinity),
      to: o.spanTo ?? (ts.length ? Math.max(...ts) : -Infinity),
    };
  });
  const inSpan = (t: number) => spans.some((s) => t >= s.from && t <= s.to);

  // Anchor-shaped fixes are neutral: set aside, they take no part in stretches.
  const solid: Array<{ f: OverlapFix; covered: boolean }> = [];
  for (let i = 0; i < fixes.length; i++) {
    if (isAnchorShaped(fixes[i])) continue;
    solid.push({ f: fixes[i], covered: exact[i] || inSpan(fixes[i].t) });
  }

  // Stretches of consecutive uncovered fixes, each with its joining fixes.
  interface Stretch {
    a: number;
    b: number;
    miles: number;
  }
  const stretches: Stretch[] = [];
  for (let i = 0; i < solid.length; i++) {
    if (solid[i].covered) continue;
    const a = i;
    while (i + 1 < solid.length && !solid[i + 1].covered) i++;
    const b = i;
    const pts = solid.slice(Math.max(0, a - 1), Math.min(solid.length, b + 2)).map((s) => s.f);
    stretches.push({ a, b, miles: trailMiles(pts) });
  }
  const isReal = (s: Stretch) => s.miles >= OVERLAP_REAL_STRETCH_MILES && s.b - s.a + 1 >= OVERLAP_REAL_STRETCH_FIXES;
  const real = stretches.filter(isReal);
  const small = stretches.filter((s) => !isReal(s));
  const out: OverlapPlan = {
    ...info,
    stretches: stretches.length,
    realStretches: real.length,
    droppedSmallStretches: small.length,
    droppedSmallMiles: Math.round(small.reduce((m, s) => m + s.miles, 0) * 100) / 100,
  };

  if (real.length === 0) return { ...out, verdict: "refuse", reason: "no_real_stretch" };
  if (real.length > 1) return { ...out, verdict: "multi", droppedSmallStretches: 0, droppedSmallMiles: 0 };

  const { a, b } = real[0];
  const lo = a > 0 ? solid[a - 1].f.t : -Infinity;
  const hi = b < solid.length - 1 ? solid[b + 1].f.t : Infinity;
  // Everything from the covered fix before to the covered fix after, anchors
  // included; the rest of the covered fixes go.
  const remainder = fixes.filter((f) => f.t >= lo && f.t <= hi);
  return { ...out, verdict: "trim", remainder, remainderMiles: trailMiles(remainder) };
}
