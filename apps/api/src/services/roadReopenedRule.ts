// "Road reopened" (Oct 2026): pure rules, unit-tested. The IO lives in
// services/streetManager.ts (spotting the moment a closure finishes, as the
// store applies the newer message) and jobs/roadReopened.ts (matching and
// sending, off the SNS request path).
//
//   "Road reopened"
//   "Durham Road has reopened, earlier than planned."
//
// A closure counts as reopened when ALL of these hold:
//   - it was a road closure (Street Manager traffic management road_closure);
//   - it finished: the permit says the works are completed (work stop), the
//     permit or activity was cancelled or revoked while the works were under
//     way, or its end was pulled forward to now;
//   - it had started, and ran for at least 12 hours (overnight jobs are
//     noise: the road is open again by morning anyway);
//   - it finished at least 2 hours before its booked end, or had no booked
//     end at all;
//   - the finish is recent (a stop reported days late is not news);
//   - it had not already been seen finishing (redeliveries and the permit's
//     later "closed" messages say nothing new).

import type { LatLng } from "./roadCorridor.js";
import type { StreetWorksRecord } from "./roadEvents.js";
import { titleCase } from "./roadEvents.js";
import { shortStreetName } from "./roadWeekAheadRule.js";

export const ROAD_REOPENED_PENDING_EVENT = "road_alert.reopened_pending";
export const ROAD_REOPENED_SENT_EVENT = "road_alert.reopened_sent";
export const ROAD_REOPENED_SKIPPED_EVENT = "road_alert.reopened_skipped";
export const ROAD_REOPENED_TITLE = "Road reopened";

/** Works shorter than this are never announced. */
export const REOPENED_MIN_DURATION_MS = 12 * 3600000;
/** "Earlier than planned" means at least this much before the booked end. */
export const REOPENED_EARLY_MARGIN_MS = 2 * 3600000;
/** A finish reported more than this long after it happened is stale. */
export const REOPENED_MAX_REPORT_LAG_MS = 12 * 3600000;
/** A pending reopening is sent within this long, or not at all. Covers a
 *  closure reopening in the evening: quiet hours hold it until 08:00. */
export const REOPENED_PENDING_MAX_AGE_MS = 14 * 3600000;
/** Most points kept from the works' geometry for the later corridor match. */
export const REOPENED_MAX_POINTS = 40;

/** Off unless ROAD_REOPENED_PUSH is exactly "1". */
export function roadReopenedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ROAD_REOPENED_PUSH === "1";
}

function normStatus(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Street Manager's work_status_ref for finished works. */
export function isFinishedStatus(s: string | null | undefined): boolean {
  const n = normStatus(s);
  return n === "completed" || n === "works_completed" || n === "closed" || n === "cancelled";
}

/** The stored row as it was before this message was applied. */
export interface StoredWorks {
  trafficManagement: string;
  workStatus: string | null;
  startAt: Date | null;
  endAt: Date | null;
  streetName: string | null;
  town: string | null;
  promoter: string | null;
  workCategory: string | null;
  geometry: unknown;
}

export type AppliedChange =
  | { kind: "upsert"; record: StreetWorksRecord }
  | { kind: "delete"; reference: string; eventAt: Date };

/** What the pending row carries: enough to match and word the push after
 *  the stored row itself is gone. */
export interface ReopenedFinding {
  reference: string;
  streetName: string | null;
  town: string | null;
  promoter: string | null;
  workCategory: string | null;
  startedAt: Date;
  finishedAt: Date;
  /** Null when the works never had a booked end. */
  plannedEndAt: Date | null;
  lines: LatLng[][];
  points: LatLng[];
}

/** True when this message could finish a closure, so the store reads the
 *  row as it was first. Most messages skip that read. */
export function mightReopen(change: AppliedChange): boolean {
  if (change.kind === "delete") return true;
  const r = change.record;
  if (isFinishedStatus(r.workStatus)) return true;
  if (r.endAt && r.endAt.getTime() <= r.eventAt.getTime()) return true;
  return false;
}

function geometryOf(g: unknown): { lines: LatLng[][]; points: LatLng[] } {
  const o = (g ?? {}) as { lines?: unknown; points?: unknown };
  return {
    lines: Array.isArray(o.lines) ? (o.lines as LatLng[][]) : [],
    points: Array.isArray(o.points) ? (o.points as LatLng[]) : [],
  };
}

/** Thin a geometry to roughly `max` points (at most 10 lines, each keeping
 *  its two ends, and 10 loose points). Plenty for a 250 m corridor match. */
export function thinGeometry(lines: LatLng[][], points: LatLng[], max: number = REOPENED_MAX_POINTS) {
  const kept = lines.filter((l) => l.length > 0).slice(0, 10);
  const per = Math.max(2, Math.floor(max / Math.max(1, kept.length)));
  const thin = (l: LatLng[]): LatLng[] => {
    if (l.length <= per) return l;
    const step = (l.length - 1) / (per - 1);
    return Array.from({ length: per }, (_, i) => l[Math.round(i * step)]);
  };
  return { lines: kept.map(thin), points: points.slice(0, 10) };
}

/**
 * Did this message reopen a closure early? `before` is the stored row as it
 * was before the message was applied (null when there was none). Call only
 * when the message was actually applied (not an older one).
 */
export function detectReopened(before: StoredWorks | null, change: AppliedChange): ReopenedFinding | null {
  const rec = change.kind === "upsert" ? change.record : null;
  const eventAt = rec ? rec.eventAt : (change as { eventAt: Date }).eventAt;
  const reference = rec ? rec.reference : (change as { reference: string }).reference;

  // Already seen finishing: a redelivery or a later "permit closed" says
  // nothing new.
  if (before && isFinishedStatus(before.workStatus)) return null;

  const wasClosure = before?.trafficManagement === "road_closure";
  const isClosure = rec?.trafficManagement === "road_closure";
  if (!wasClosure && !isClosure) return null;

  let finishedAt: Date | null = null;
  let pulledForward = false;
  if (rec) {
    if (isFinishedStatus(rec.workStatus)) {
      finishedAt = rec.actualEndAt ?? eventAt;
    } else if (
      rec.endAt &&
      rec.endAt.getTime() <= eventAt.getTime() &&
      before?.endAt &&
      before.endAt.getTime() > eventAt.getTime()
    ) {
      // The booked end was pulled forward to now (an activity updated).
      finishedAt = rec.endAt;
      pulledForward = true;
    }
  } else if (before) {
    // Cancelled or revoked, or the traffic management relaxed to nothing
    // worth knowing, while the closure was in place.
    const inPlace =
      before.startAt != null &&
      before.startAt.getTime() <= eventAt.getTime() &&
      (before.endAt == null || before.endAt.getTime() > eventAt.getTime());
    if (inPlace) finishedAt = eventAt;
  }
  if (!finishedAt) return null;
  if (eventAt.getTime() - finishedAt.getTime() > REOPENED_MAX_REPORT_LAG_MS) return null;

  const startedAt = rec?.startAt ?? before?.startAt ?? null;
  if (!startedAt || startedAt.getTime() > finishedAt.getTime()) return null;
  if (finishedAt.getTime() - startedAt.getTime() < REOPENED_MIN_DURATION_MS) return null;

  // The booked end: the message's own proposed end, else what was stored
  // before (which is the booked end while the works were unfinished). An end
  // pulled forward replaced the booking, so the stored one is the booking.
  const plannedEndAt = pulledForward
    ? before?.endAt ?? null
    : (rec ? rec.plannedEndAt ?? null : null) ?? before?.endAt ?? null;
  if (plannedEndAt && plannedEndAt.getTime() - finishedAt.getTime() < REOPENED_EARLY_MARGIN_MS) return null;

  const geom = rec && (rec.lines.length > 0 || rec.points.length > 0) ? { lines: rec.lines, points: rec.points } : geometryOf(before?.geometry);
  if (geom.lines.length === 0 && geom.points.length === 0) return null;
  const thin = thinGeometry(geom.lines, geom.points);

  return {
    reference,
    streetName: rec?.streetName ?? before?.streetName ?? null,
    town: rec?.town ?? before?.town ?? null,
    promoter: rec?.promoter ?? before?.promoter ?? null,
    workCategory: rec?.workCategory ?? before?.workCategory ?? null,
    startedAt,
    finishedAt,
    plannedEndAt,
    lines: thin.lines,
    points: thin.points,
  };
}

// ── Pending rows (AppEvent metadata) ───────────────────────────────

export function findingToMetadata(f: ReopenedFinding): Record<string, unknown> {
  return {
    reference: f.reference,
    streetName: f.streetName,
    town: f.town,
    promoter: f.promoter,
    workCategory: f.workCategory,
    startedAt: f.startedAt.toISOString(),
    finishedAt: f.finishedAt.toISOString(),
    plannedEndAt: f.plannedEndAt ? f.plannedEndAt.toISOString() : null,
    lines: f.lines,
    points: f.points,
  };
}

function dateOr(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function findingFromMetadata(m: unknown): ReopenedFinding | null {
  const o = (m ?? {}) as Record<string, unknown>;
  if (typeof o.reference !== "string" || !o.reference) return null;
  const startedAt = dateOr(o.startedAt);
  const finishedAt = dateOr(o.finishedAt);
  if (!startedAt || !finishedAt) return null;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const g = geometryOf(o);
  return {
    reference: o.reference,
    streetName: s(o.streetName),
    town: s(o.town),
    promoter: s(o.promoter),
    workCategory: s(o.workCategory),
    startedAt,
    finishedAt,
    plannedEndAt: dateOr(o.plannedEndAt),
    lines: g.lines,
    points: g.points,
  };
}

/** Newest pending finding per works reference. */
export function latestPerReference(rows: { createdAt: Date; metadata: unknown }[]): ReopenedFinding[] {
  const out = new Map<string, { at: number; f: ReopenedFinding }>();
  for (const r of rows) {
    const f = findingFromMetadata(r.metadata);
    if (!f) continue;
    const prev = out.get(f.reference);
    if (!prev || prev.at < r.createdAt.getTime()) out.set(f.reference, { at: r.createdAt.getTime(), f });
  }
  return [...out.values()].map((v) => v.f);
}

/** Works references already announced to this driver, from their
 *  road_alert.reopened_sent rows. */
export function sentReferencesFrom(metadatas: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const m of metadatas) {
    const ref = (m as { reference?: unknown } | null)?.reference;
    if (typeof ref === "string") out.add(ref);
  }
  return out;
}

// ── Words ──────────────────────────────────────────────────────────

export interface ReopenedCopy {
  title: string;
  body: string;
}

/** "Durham Road has reopened, earlier than planned." Null when there is no
 *  street name to give (a push with nothing to act on is not sent). */
export function buildReopenedCopy(f: ReopenedFinding): ReopenedCopy | null {
  const name = shortStreetName(titleCase(f.streetName));
  if (!name) return null;
  const after =
    f.workCategory === "immediate_emergency"
      ? " after emergency works"
      : f.workCategory === "immediate_urgent"
        ? " after urgent works"
        : "";
  const early = f.plannedEndAt ? ", earlier than planned" : "";
  return { title: ROAD_REOPENED_TITLE, body: `${name} has reopened${after}${early}.` };
}
