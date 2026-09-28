/**
 * recordedDuplicate: is this recorded trip a second copy of a drive the
 * driver already has?
 *
 * A phone cannot be in two places at once, so two recordings that were at the
 * same places at the same moments are one drive, however they got made. In the
 * 14 days to 28 Sep 2026 the fleet held 278 pairs of automatic trips
 * overlapping by 80% or more (87 drivers, about 2,100 miles in the shorter
 * trip of each pair). The main source was a shift recording and the automatic
 * engine's own copy of the same fixes both being saved: the shift's lock was
 * released without its breadcrumbs being processed (stale_active_shift_cleared,
 * "active_too_long"), the app-open orphan sweep then saved the engine's copy,
 * and the shift saved its own when it was finally closed (4cc04bac,
 * 26 Sep: 52.0 mi and 55.1 mi for the same afternoon, saved two seconds
 * apart). The other was the same drive finalized twice by two engine paths
 * (0419feba, 21 Sep: 19:31-19:38 and 19:33-19:38, saved in the same minute).
 *
 * The judgement is made on the breadcrumbs, never on times or end points
 * alone: a fix counts as "already recorded" when another trip has a fix within
 * MATCH_WINDOW_MS and MATCH_RADIUS_M of it. Times and end points are only
 * hints; the rule wants the same places at the same moments. Two genuinely
 * separate drives can share a start time (a shared account in two cars) but
 * cannot share their fixes, so they are never matched.
 *
 * Pure. POST /trips uses coveredShare to refuse a new recording whose fixes
 * are almost all already on the driver's trips; the cleanup script
 * scripts/dedupe-overlapping-trips.mjs uses the same functions to find the
 * copies already saved.
 */

export interface DuplicateFix {
  /** recordedAt, epoch ms */
  t: number;
  lat: number;
  lng: number;
}

/** Another trip's fix must be this close in time... CoreLocation delivers the
 *  same fix to every location manager in the app, but the shift recorder and
 *  the automatic engine sample at different distance filters (50 m and 20 m),
 *  so the nearest counterpart is usually seconds away, not identical. Two
 *  minutes leaves room for a sparse recording without letting a later pass
 *  through the same street count. */
export const MATCH_WINDOW_MS = 2 * 60 * 1000;
/** ...and this close in space. Wider than GPS error, far narrower than the
 *  distance a car covers in the time window, so a fix matched in time but not
 *  in place (a different road) stays unmatched. */
export const MATCH_RADIUS_M = 150;
/** Share of a trip's fixes that must already be recorded elsewhere before it
 *  is treated as a copy. Nine in ten: the copies in the 28 Sep sweep matched
 *  on 95-100% of their fixes, while a genuinely longer recording that merely
 *  overlaps another keeps a large unmatched stretch. */
export const SAME_DRIVE_MIN_SHARE = 0.9;
/** A copy must have at least this many fixes to be judged at all. Two fixes is
 *  what a trip needs to draw a line, and both must then be matched. */
export const MIN_FIXES = 2;

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function usable(f: DuplicateFix): boolean {
  return Number.isFinite(f.t) && Number.isFinite(f.lat) && Number.isFinite(f.lng);
}

/** Sort a trip's fixes by time, dropping any without a usable time or place. */
export function sortFixes(fixes: DuplicateFix[]): DuplicateFix[] {
  return fixes.filter(usable).sort((a, b) => a.t - b.t);
}

/** Index of the first fix at or after t in a time-sorted list. */
function lowerBound(sorted: DuplicateFix[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** True when `sorted` (time-sorted) has a fix within the window and radius of f. */
export function hasCounterpart(f: DuplicateFix, sorted: DuplicateFix[]): boolean {
  for (let i = lowerBound(sorted, f.t - MATCH_WINDOW_MS); i < sorted.length; i++) {
    const g = sorted[i];
    if (g.t > f.t + MATCH_WINDOW_MS) break;
    if (metresBetween(f, g) <= MATCH_RADIUS_M) return true;
  }
  return false;
}

export interface CoverageResult {
  /** Share (0..1) of the subject's usable fixes with a counterpart. */
  share: number;
  /** Usable fixes in the subject. */
  fixes: number;
  matched: number;
  /** The other trip that matched the most fixes, or null when none did. */
  bestTripId: string | null;
  bestTripMatched: number;
  /** Path length of the subject's own trace, in miles. */
  pathMiles: number;
  /** Path length along stretches with an unmatched fix at either end: the
   *  driving only the subject recorded, which would be lost with it. */
  unmatchedMiles: number;
}

/**
 * How much of `subject` is already recorded by the `others`, judged fix by fix.
 * A fix matched by any of them counts once; `bestTripId` names the trip that
 * matched the most, which is the one to point a refused copy at.
 */
export function coveredShare(
  subject: DuplicateFix[],
  others: { id: string; fixes: DuplicateFix[] }[]
): CoverageResult {
  const mine = sortFixes(subject);
  const theirs = others.map((o) => ({ id: o.id, fixes: sortFixes(o.fixes), matched: 0 }));
  let matched = 0;
  const hits: boolean[] = [];
  for (const f of mine) {
    let hit = false;
    for (const o of theirs) {
      if (hasCounterpart(f, o.fixes)) {
        o.matched++;
        hit = true;
      }
    }
    hits.push(hit);
    if (hit) matched++;
  }
  let pathM = 0;
  let unmatchedM = 0;
  for (let i = 1; i < mine.length; i++) {
    const d = metresBetween(mine[i - 1], mine[i]);
    pathM += d;
    if (!hits[i - 1] || !hits[i]) unmatchedM += d;
  }
  let best: (typeof theirs)[number] | null = null;
  for (const o of theirs) if (o.matched > 0 && (best == null || o.matched > best.matched)) best = o;
  return {
    share: mine.length > 0 ? matched / mine.length : 0,
    fixes: mine.length,
    matched,
    bestTripId: best?.id ?? null,
    bestTripMatched: best?.matched ?? 0,
    pathMiles: pathM / 1609.344,
    unmatchedMiles: unmatchedM / 1609.344,
  };
}

/** The driving only the subject recorded may be at most this much, in miles
 *  or as a share of its own path, whichever is larger. Nine in ten fixes
 *  matched still leaves room for a real stretch at either end: 0657b418's
 *  9 Sep engine copy matched 92% of its fixes against the shift's recording
 *  yet started 24 minutes earlier and ran 8.6 miles longer. Those miles exist
 *  nowhere else, so that trip is not a copy. */
export const MAX_UNMATCHED_MILES = 0.5;
export const MAX_UNMATCHED_SHARE = 0.05;

/** True when the coverage says the subject is a copy of what is already saved:
 *  nine in ten of its fixes are recorded elsewhere AND the stretch only it
 *  recorded is negligible. */
export function isRecordedCopy(c: CoverageResult): boolean {
  return (
    c.fixes >= MIN_FIXES &&
    c.share >= SAME_DRIVE_MIN_SHARE &&
    c.bestTripId != null &&
    c.unmatchedMiles <= Math.max(MAX_UNMATCHED_MILES, c.pathMiles * MAX_UNMATCHED_SHARE)
  );
}

// ── Cleanup of copies already saved ─────────────────────────────────────────

export interface CleanupTrip {
  id: string;
  createdAt: Date;
  startedAt: Date;
  endedAt: Date | null;
  distanceMiles: number;
  classification: string;
  classificationSource: string | null;
  notes: string | null;
  businessPurpose: string | null;
  platformTag: string | null;
  projectLabel: string | null;
  category: string | null;
  odometerStart: number | null;
  odometerEnd: number | null;
  /** The driver moved its start or end, or it is a leg of a split they made
   *  themselves. Their correction is the truth about that trip; a copy of it
   *  is never removed. */
  driverEdited: boolean;
  fixes: DuplicateFix[];
}

export type CleanupSkipReason =
  | "keeper_spans_12h"
  | "driver_edited"
  | "classified_differently"
  | "driver_details_differ"
  | "longer_than_keeper";

export interface CleanupDecision {
  remove: { trip: CleanupTrip; keeper: CleanupTrip; coverage: CoverageResult }[];
  skipped: { trip: CleanupTrip; keeper: CleanupTrip; coverage: CoverageResult; reason: CleanupSkipReason }[];
}

/** A copy may hold a little more distance than its keeper (a denser sampling
 *  of the same road reads slightly longer), but not a real stretch more: that
 *  means the keeper is missing part of the drive, and removing the copy would
 *  lose miles. */
export const KEEPER_DISTANCE_SLACK_MILES = 0.5;
/** A keeper whose fixes or stated window span longer than this is not a trip
 *  the driver would recognise but a recording that ran through a night
 *  (4cc04bac's 21 Sep shift trip, fixes from 15:45 that day to 20:30 the next;
 *  31161476's 4 Sep trip, dated a day before most of its fixes). Removing
 *  the well-formed trips inside it would leave the malformed one standing;
 *  that shape wants splitting, not this cleanup, so it is reported instead. */
export const KEEPER_MAX_SPAN_MS = 12 * 60 * 60 * 1000;
export const KEEPER_DISTANCE_SLACK_RATIO = 1.1;

const blank = (s: string | null | undefined) => s == null || s.trim() === "";

/** First to last usable fix, in ms. */
function fixSpanMs(fixes: DuplicateFix[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of fixes) {
    if (!Number.isFinite(f.t)) continue;
    if (f.t < lo) lo = f.t;
    if (f.t > hi) hi = f.t;
  }
  return hi > lo ? hi - lo : 0;
}

/** Details only a driver adds, compared as they would read on the trip. */
function driverDetailsDiffer(copy: CleanupTrip, keeper: CleanupTrip): boolean {
  const fields: (keyof CleanupTrip)[] = [
    "notes",
    "businessPurpose",
    "platformTag",
    "projectLabel",
    "category",
    "odometerStart",
    "odometerEnd",
  ];
  for (const f of fields) {
    const a = copy[f] as string | number | null;
    const b = keeper[f] as string | number | null;
    if (typeof a === "string" ? blank(a) : a == null) continue; // copy holds nothing here
    if (a !== b) return true;
  }
  return false;
}

/**
 * Decide which of a driver's overlapping recorded trips are copies, for the
 * one-off cleanup. Trips are considered largest first (most fixes, then the
 * earliest saved); each is kept unless the trips already kept record at least
 * SAME_DRIVE_MIN_SHARE of its fixes. A copy is only marked for removal when
 * nothing the driver gave it would be lost:
 *   - its keeper is a recording of under 12 hours, not one run overnight,
 *   - the driver never moved its start or end, or split it themselves,
 *   - its classification is unclassified or matches the keeper's,
 *   - any note, purpose, platform, project, category or odometer it carries
 *     matches the keeper's,
 *   - it holds no more distance than the keeper (with a small slack).
 * Anything else is reported as skipped and kept, and then counts as kept for
 * the trips after it, so nothing downstream is removed against a trip that is
 * itself in doubt.
 */
export function planCleanup(trips: CleanupTrip[]): CleanupDecision {
  const ordered = [...trips].sort(
    (a, b) => b.fixes.length - a.fixes.length || a.createdAt.getTime() - b.createdAt.getTime()
  );
  const kept: CleanupTrip[] = [];
  const decision: CleanupDecision = { remove: [], skipped: [] };
  for (const trip of ordered) {
    if (kept.length === 0) {
      kept.push(trip);
      continue;
    }
    const coverage = coveredShare(
      trip.fixes,
      kept.map((k) => ({ id: k.id, fixes: k.fixes }))
    );
    if (!isRecordedCopy(coverage)) {
      kept.push(trip);
      continue;
    }
    const keeper = kept.find((k) => k.id === coverage.bestTripId)!;
    let reason: CleanupSkipReason | null = null;
    const keeperWindowMs = keeper.endedAt ? keeper.endedAt.getTime() - keeper.startedAt.getTime() : 0;
    if (Math.max(fixSpanMs(keeper.fixes), keeperWindowMs) > KEEPER_MAX_SPAN_MS) {
      reason = "keeper_spans_12h";
    } else if (trip.driverEdited) {
      reason = "driver_edited";
    } else if (trip.classification !== "unclassified" && trip.classification !== keeper.classification) {
      reason = "classified_differently";
    } else if (driverDetailsDiffer(trip, keeper)) {
      reason = "driver_details_differ";
    } else if (
      trip.distanceMiles >
      Math.max(keeper.distanceMiles * KEEPER_DISTANCE_SLACK_RATIO, keeper.distanceMiles + KEEPER_DISTANCE_SLACK_MILES)
    ) {
      reason = "longer_than_keeper";
    }
    if (reason) {
      decision.skipped.push({ trip, keeper, coverage, reason });
      kept.push(trip);
    } else {
      decision.remove.push({ trip, keeper, coverage });
    }
  }
  return decision;
}
