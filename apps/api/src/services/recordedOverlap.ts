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
 * The test here is much sharper than the refusal's. A fix counts as already
 * saved only when another trip holds a fix at the SAME millisecond and within
 * 50 m. Two phones, or one phone on two drives, cannot do that by chance; only
 * the same fix stored twice can. So a match is proof, not a probability, and
 * the only question left is whether trimming leaves something worth saving.
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
}

/** Same millisecond AND this close. GPS error is a few metres and the same
 *  fix stored twice is identical; 50 m only absorbs a re-projected copy. */
export const OVERLAP_MATCH_RADIUS_M = 50;
/** At least this many shared fixes. One shared boundary fix is just two
 *  recordings meeting where one ended and the next began. */
export const OVERLAP_MIN_SHARED_FIXES = 5;
/** ...and at least this share of the incoming fixes. Below a tenth the
 *  doubled stretch is a few hundred metres, and leaving today's behaviour
 *  alone costs less than rewriting a trip on thin evidence. */
export const OVERLAP_MIN_SHARE = 0.1;
/** A remainder shorter than this is not a trip of its own (the existing phantom
 *  rules also apply in the route). */
export const OVERLAP_MIN_REMAINDER_FIXES = 2;
export const OVERLAP_MIN_REMAINDER_MILES = 0.3;

/** The phone's planted departure anchor: accuracy exactly 50, speed 0. It is
 *  where the car was parked, not a measured fix, and two trips leaving the same
 *  spot can both carry one, so it never counts as shared. */
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
  sharedFixes: number;
  /** Trips that held shared fixes, most first. */
  keptTripIds: string[];
  /** The trip holding most of the shared fixes. */
  bestTripId: string | null;
  /** Separate stretches of unshared fixes. */
  stretches: number;
  /** trim / refuse: what is left to save. */
  remainder: OverlapFix[];
  remainderMiles: number;
  fromMiles: number;
}

/**
 * Decide what to do with an incoming recording given the driver's other trips
 * that overlap it in time.
 *
 * trim: exactly one stretch of unshared fixes. The remainder is that stretch
 *   plus the shared fix next to it (before it if there is one, else after), so
 *   the segment joining it to the saved trip keeps its distance.
 * refuse: nothing worth saving is left (answer as the 90% refusal does).
 * multi: several separate stretches; the caller saves whole.
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

  const shared: boolean[] = [];
  const perTrip = new Map<string, number>();
  let sharedCount = 0;
  for (const f of fixes) {
    let hit = false;
    if (!isAnchorShaped(f)) {
      for (const m of byTime.get(f.t) ?? []) {
        if (metres(f, m.fix) <= OVERLAP_MATCH_RADIUS_M) {
          hit = true;
          perTrip.set(m.tripId, (perTrip.get(m.tripId) ?? 0) + 1);
        }
      }
    }
    shared.push(hit);
    if (hit) sharedCount++;
  }

  const ranked = [...perTrip].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const info: OverlapPlan = { ...base, sharedFixes: sharedCount, keptTripIds: ranked, bestTripId: ranked[0] ?? null };
  if (sharedCount < OVERLAP_MIN_SHARED_FIXES || sharedCount / fixes.length < OVERLAP_MIN_SHARE) {
    return { ...info, reason: "shared_too_few" };
  }

  // A shift's recording is never trimmed against a trip that is not on the
  // shift: the shift scorecard must keep counting the drive. Today's rules apply.
  if (args.incomingHasShift) {
    const byId = new Map(args.others.map((o) => [o.id, o]));
    if (ranked.some((id) => !byId.get(id)?.shiftId)) return { ...info, reason: "shift_vs_unshifted" };
  }

  // Stretches of consecutive unshared fixes.
  const stretches: Array<[number, number]> = [];
  for (let i = 0; i < fixes.length; i++) {
    if (shared[i]) continue;
    const start = i;
    while (i + 1 < fixes.length && !shared[i + 1]) i++;
    stretches.push([start, i]);
  }

  const out: OverlapPlan = { ...info, stretches: stretches.length };
  if (stretches.length === 0) return { ...out, verdict: "refuse", reason: "all_shared" };
  if (stretches.length > 1) return { ...out, verdict: "multi" };

  const [a, b] = stretches[0];
  const own = fixes.slice(a, b + 1);
  // The adjacent shared fix: before the stretch if there is one, else after.
  const remainder = a > 0 ? [fixes[a - 1], ...own] : b < fixes.length - 1 ? [...own, fixes[b + 1]] : own;
  const remainderMiles = trailMiles(remainder);
  if (own.length < OVERLAP_MIN_REMAINDER_FIXES) {
    return { ...out, verdict: "refuse", reason: "remainder_too_few_fixes", remainder, remainderMiles };
  }
  if (remainderMiles < OVERLAP_MIN_REMAINDER_MILES) {
    return { ...out, verdict: "refuse", reason: "remainder_too_short", remainder, remainderMiles };
  }
  return { ...out, verdict: "trim", remainder, remainderMiles };
}
