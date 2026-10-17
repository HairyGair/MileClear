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
//   - it finished, and something says so outright: the permit's status says
//     the works are completed (a work stop), the permit was cancelled or
//     revoked, or an activity's end was pulled forward to now. A permit
//     whose traffic management merely dropped to something we do not keep
//     (or is missing) is NOT a reopening;
//   - we saw it in place: the permit reported an actual start, or we stored
//     it as in progress. A cancellation of works that never started is not
//     a reopening;
//   - it ran for at least 12 hours (overnight jobs are noise: the road is
//     open again by morning anyway);
//   - it finished early. Street Manager usually books an end DATE with no
//     time ("by the end of that day"); then early means finishing on an
//     earlier UK day than the booked one, so a closure lifted at 15:00 on its
//     last day is on time. With a booked time, early means at least 2 hours
//     before it. No booked end at all also counts;
//   - the finish is recent (a stop reported days late is not news);
//   - it had not already been seen finishing (redeliveries and the permit's
//     later "closed" messages say nothing new).
//
// One closure often has a permit AND an activity (different references), and
// a job can hold several permits. They are one closure here when they share a
// reference or works reference, or name the same street within 150 m.

import type { LatLng } from "./roadCorridor.js";
import { haversineMetres, ukLocalParts } from "./roadCorridor.js";
import type { StreetWorksRecord } from "./roadEvents.js";
import { titleCase } from "./roadEvents.js";
import { shortStreetName } from "./roadWeekAheadRule.js";

export const ROAD_REOPENED_PENDING_EVENT = "road_alert.reopened_pending";
export const ROAD_REOPENED_SENT_EVENT = "road_alert.reopened_sent";
export const ROAD_REOPENED_SKIPPED_EVENT = "road_alert.reopened_skipped";
export const ROAD_REOPENED_TITLE = "Road reopened";

/** Works shorter than this are never announced. */
export const REOPENED_MIN_DURATION_MS = 12 * 3600000;
/** With a booked end TIME, "earlier than planned" means at least this much
 *  before it. */
export const REOPENED_EARLY_MARGIN_MS = 2 * 3600000;
/** A finish reported more than this long after it happened is stale. */
export const REOPENED_MAX_REPORT_LAG_MS = 12 * 3600000;
/** A reopening is sent within this long of the road actually reopening, or
 *  not at all. Covers a closure lifted in the evening: quiet hours hold it
 *  until 08:00. */
export const REOPENED_PENDING_MAX_AGE_MS = 14 * 3600000;
/** Pending rows older than this are purged (and the record-time dedupe
 *  looks back this far). */
export const REOPENED_PENDING_KEEP_DAYS = 3;
/** Most points kept from the works' geometry for the later corridor match. */
export const REOPENED_MAX_POINTS = 40;
/** A permit and an activity on the same street this close are one closure. */
export const SAME_CLOSURE_M = 150;

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

function isInProgressStatus(s: string | null | undefined): boolean {
  const n = normStatus(s);
  return n === "in_progress" || n === "works_in_progress";
}

/** combineDateTime's "end of the booked day" value (hh:59:59.000). A booked
 *  end with a real time almost never lands on that second. */
export function looksLikeEndOfDay(d: Date): boolean {
  return d.getUTCMinutes() === 59 && d.getUTCSeconds() === 59 && d.getUTCMilliseconds() === 0;
}

/**
 * Did the works finish earlier than booked? With a booked time: at least
 * 2 hours before it. With a booked date only (stored as the last second of
 * that day): on an earlier UK calendar day. Street Manager dates arrive as
 * the day's UK midnight in UTC, so the booked day is the UK day of that
 * midnight, i.e. one day less a second before the stored end.
 */
export function finishedEarly(finishedAt: Date, plannedEndAt: Date | null, plannedEndHasTime: boolean): boolean {
  if (!plannedEndAt) return true;
  if (plannedEndHasTime) return plannedEndAt.getTime() - finishedAt.getTime() >= REOPENED_EARLY_MARGIN_MS;
  const bookedDay = ukLocalParts(new Date(plannedEndAt.getTime() - 86400000 + 1000)).dayKey;
  return ukLocalParts(finishedAt).dayKey < bookedDay;
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
  | {
      kind: "delete";
      reference: string;
      eventAt: Date;
      reason?: "cancelled" | "completed" | "relaxed";
      actualEndAt?: Date | null;
    };

/** What the pending row carries: enough to match and word the push after
 *  the stored row itself is gone. */
export interface ReopenedFinding {
  reference: string;
  /** Permit work_reference_number, when the message gave one. */
  workReference: string | null;
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
  if (change.kind === "delete") return change.reason === "cancelled" || change.reason === "completed";
  const r = change.record;
  if (isFinishedStatus(r.workStatus)) return true;
  if (r.objectType === "ACTIVITY" && r.endAt && r.endAt.getTime() <= r.eventAt.getTime()) return true;
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
  const del = change.kind === "delete" ? change : null;
  const eventAt = rec ? rec.eventAt : del!.eventAt;
  const reference = rec ? rec.reference : del!.reference;

  // Already seen finishing: a redelivery or a later "permit closed" says
  // nothing new.
  if (before && isFinishedStatus(before.workStatus)) return null;

  const wasClosure = before?.trafficManagement === "road_closure";
  const isClosure = rec?.trafficManagement === "road_closure";
  if (!wasClosure && !isClosure) return null;

  const seenInPlace = rec?.actualStartAt != null || isInProgressStatus(before?.workStatus);

  let finishedAt: Date | null = null;
  // The booked end, and whether it has a time.
  let plannedEndAt: Date | null = null;
  let plannedEndHasTime = false;
  const fromStored = () => {
    plannedEndAt = before?.endAt ?? null;
    plannedEndHasTime = plannedEndAt != null && !looksLikeEndOfDay(plannedEndAt);
  };

  if (rec) {
    if (isFinishedStatus(rec.workStatus)) {
      // A work stop. Only works we saw under way.
      if (!seenInPlace) return null;
      finishedAt = rec.actualEndAt ?? eventAt;
      if (rec.plannedEndAt) {
        plannedEndAt = rec.plannedEndAt;
        plannedEndHasTime = rec.plannedEndHasTime ?? !looksLikeEndOfDay(rec.plannedEndAt);
      } else {
        fromStored();
      }
    } else if (
      rec.objectType === "ACTIVITY" &&
      rec.endAt &&
      rec.endAt.getTime() <= eventAt.getTime() &&
      before?.endAt &&
      before.endAt.getTime() > eventAt.getTime()
    ) {
      // An activity's end pulled forward to now. The new end replaced the
      // booking, so the stored end is the booking.
      finishedAt = rec.endAt;
      fromStored();
    }
  } else if (before && (del!.reason === "cancelled" || del!.reason === "completed")) {
    // Cancelled or revoked (or relaxed on a message saying the works are
    // done) while we had it in place. Never works that had not started.
    const inPlace =
      isInProgressStatus(before.workStatus) &&
      before.startAt != null &&
      before.startAt.getTime() <= eventAt.getTime() &&
      (before.endAt == null || before.endAt.getTime() > eventAt.getTime());
    if (inPlace) {
      finishedAt = (del!.reason === "completed" ? del!.actualEndAt : null) ?? eventAt;
      fromStored();
    }
  }
  if (!finishedAt) return null;
  const finished: Date = finishedAt;
  if (eventAt.getTime() - finished.getTime() > REOPENED_MAX_REPORT_LAG_MS) return null;

  const startedAt = rec?.startAt ?? before?.startAt ?? null;
  if (!startedAt || startedAt.getTime() > finished.getTime()) return null;
  if (finished.getTime() - startedAt.getTime() < REOPENED_MIN_DURATION_MS) return null;

  if (!finishedEarly(finished, plannedEndAt, plannedEndHasTime)) return null;

  const geom = rec && (rec.lines.length > 0 || rec.points.length > 0) ? { lines: rec.lines, points: rec.points } : geometryOf(before?.geometry);
  if (geom.lines.length === 0 && geom.points.length === 0) return null;
  const thin = thinGeometry(geom.lines, geom.points);

  return {
    reference,
    workReference: rec?.workReference ?? null,
    streetName: rec?.streetName ?? before?.streetName ?? null,
    town: rec?.town ?? before?.town ?? null,
    promoter: rec?.promoter ?? before?.promoter ?? null,
    workCategory: rec?.workCategory ?? before?.workCategory ?? null,
    startedAt,
    finishedAt: finished,
    plannedEndAt,
    lines: thin.lines,
    points: thin.points,
  };
}

// ── One closure, several references ────────────────────────────────

export interface ClosurePlace {
  reference: string;
  workReference?: string | null;
  streetName: string | null;
  lines: LatLng[][];
  points: LatLng[];
}

function streetKey(name: string | null): string | null {
  const s = shortStreetName(titleCase(name));
  return s ? s.toLowerCase().replace(/\s+/g, " ").trim() : null;
}

function placePoints(p: Pick<ClosurePlace, "lines" | "points">): LatLng[] {
  return [...p.lines.flat(), ...p.points];
}

/** The same closure: a shared reference or works reference, or the same
 *  street within 150 m (a permit and its activity). */
export function sameClosure(a: ClosurePlace, b: ClosurePlace): boolean {
  if (a.reference === b.reference) return true;
  if (a.workReference && b.workReference && a.workReference === b.workReference) return true;
  const ka = streetKey(a.streetName);
  if (!ka || ka !== streetKey(b.streetName)) return false;
  const pa = placePoints(a), pb = placePoints(b);
  for (const p of pa) for (const q of pb) if (haversineMetres(p, q) <= SAME_CLOSURE_M) return true;
  return false;
}

export interface ReopenedClosure {
  /** The finding the words and the match come from: the latest finish. */
  lead: ReopenedFinding;
  /** Every works reference that is part of it. */
  references: string[];
}

/** Pending findings -> one per closure. */
export function clusterFindings(findings: ReopenedFinding[]): ReopenedClosure[] {
  const out: { members: ReopenedFinding[] }[] = [];
  for (const f of findings) {
    const hit = out.find((c) => c.members.some((m) => sameClosure(m, f)));
    if (hit) hit.members.push(f);
    else out.push({ members: [f] });
  }
  return out.map((c) => {
    const lead = [...c.members].sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime())[0];
    return { lead, references: [...new Set(c.members.map((m) => m.reference))] };
  });
}

// ── Pending rows (AppEvent metadata) ───────────────────────────────

export function findingToMetadata(f: ReopenedFinding): Record<string, unknown> {
  return {
    reference: f.reference,
    workReference: f.workReference,
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
    workReference: s(o.workReference),
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
 *  road_alert.reopened_sent rows (the lead and every other part). */
export function sentReferencesFrom(metadatas: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const m of metadatas) {
    const o = (m ?? {}) as { reference?: unknown; references?: unknown };
    if (typeof o.reference === "string") out.add(o.reference);
    if (Array.isArray(o.references)) for (const r of o.references) if (typeof r === "string") out.add(r);
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
