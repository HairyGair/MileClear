// Pure rules for the "Missing a trip?" sheet (components/MissingTripReporter).
//
// 26 Sep 2026: a cohort of drivers report a missed drive and then wait for
// support to type it in for them. One driver filed the same drive three times
// in two days. The sheet now asks for the journey in fields (from, to, when)
// so it can offer to add the trip there and then, and it says straight away
// when a pause the driver set is the reason nothing was recorded.
//
// Everything here is free of React and the database so it can be tested.

import { shortDay } from "../tracking/pauseRule";
import { clockTime, defaultEndFor } from "./manualTimeRule";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** The longest pause the app offers ("For a week"), plus a day of slack. A
 *  running pause whose start we cannot see started no earlier than this. */
export const MAX_PAUSE_MS = 8 * DAY_MS;

/** Average speed assumed for the end time when the driver typed the miles
 *  because routing was unavailable. Only the end time uses it. */
export const TYPED_MILES_ASSUMED_MPH = 30;

// ── The report note ─────────────────────────────────────────────────────────

export interface ReportFields {
  from: string | null;
  to: string | null;
  departAt: Date | null;
  extra: string;
}

/**
 * The one-line, human-readable note support has always read, built from the
 * fields: "Fleetwood FY7 7LP to L9 0NB, set off around 13:40 on Thu 24 Sep.
 * Came back the same way". The admin inbox and Discord show this as before.
 */
export function describeReportNote(f: ReportFields): string {
  const parts: string[] = [];
  const from = f.from?.trim();
  const to = f.to?.trim();
  let route = "";
  if (from && to) route = `${from} to ${to}`;
  else if (from) route = `From ${from}`;
  else if (to) route = `To ${to}`;
  const when = f.departAt ? `set off around ${clockTime(f.departAt)} on ${shortDay(f.departAt)}` : "";
  if (route && when) parts.push(`${route}, ${when}.`);
  else if (route) parts.push(`${route}.`);
  else if (when) parts.push(`${when.charAt(0).toUpperCase()}${when.slice(1)}.`);
  const extra = f.extra.trim();
  if (extra) parts.push(extra);
  return parts.join(" ").slice(0, 1000);
}

/** A picked place as words. A map pin with no address still names itself. */
export function placeLabel(address: string | null | undefined): string {
  const a = address?.trim();
  return a ? a : "a point picked on the map";
}

/** Enough to send: a time, and either both places or a note. */
export function canSendReport(args: {
  hasFrom: boolean;
  hasTo: boolean;
  departAt: Date | null;
  extra: string;
}): boolean {
  if (!args.departAt) return false;
  return (args.hasFrom && args.hasTo) || args.extra.trim().length > 0;
}

// ── Adding the trip ─────────────────────────────────────────────────────────

/**
 * When the added trip ends. With a routed duration, departure plus the route
 * (rounded up to the minute). With typed miles only, an estimate at
 * TYPED_MILES_ASSUMED_MPH. Never later than `now`: a drive that "ends" in the
 * future would be refused by the API.
 */
export function endTimeFor(args: {
  departAt: Date;
  routedSecs: number | null;
  typedMiles: number | null;
  now: number;
}): Date {
  let minutes: number | null = null;
  if (args.routedSecs != null && Number.isFinite(args.routedSecs) && args.routedSecs > 0) {
    minutes = args.routedSecs / 60;
  } else if (args.typedMiles != null && Number.isFinite(args.typedMiles) && args.typedMiles > 0) {
    minutes = (args.typedMiles / TYPED_MILES_ASSUMED_MPH) * 60;
  }
  const end = defaultEndFor(args.departAt, minutes);
  const floor = args.departAt.getTime() + MINUTE_MS;
  const capped = Math.min(end.getTime(), args.now);
  return new Date(Math.max(capped, floor));
}

/** "12.4" or "12,4" -> 12.4. Anything else, or outside 0-1000 miles, is null. */
export function parseMilesInput(text: string): number | null {
  const cleaned = text.trim().replace(",", ".").replace(/\s*(mi|miles?)$/i, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  return Math.round(n * 10) / 10;
}

export interface LocalTripRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_address: string | null;
  end_address: string | null;
  distance_miles: number | null;
}

/**
 * The first saved trip that overlaps [start, end]. A trip with no end counts
 * as a one-minute trip at its start. Touching ends (one ends as the next
 * starts) do not overlap: back-to-back drives are normal.
 */
export function findOverlappingTrip<T extends LocalTripRow>(
  trips: T[],
  start: Date,
  end: Date
): T | null {
  const s = start.getTime();
  const e = end.getTime();
  for (const t of trips) {
    const ts = new Date(t.started_at).getTime();
    if (!Number.isFinite(ts)) continue;
    const rawEnd = t.ended_at ? new Date(t.ended_at).getTime() : Number.NaN;
    const te = Number.isFinite(rawEnd) && rawEnd > ts ? rawEnd : ts + MINUTE_MS;
    if (ts < e && te > s) return t;
  }
  return null;
}

// ── Pause ───────────────────────────────────────────────────────────────────

export interface PauseInterval {
  /** When the pause began, epoch ms. Null when the start is not on the phone
   *  any more (the event log rolled over). */
  start: number | null;
  /** When it ended or will end, epoch ms. */
  end: number;
}

export interface PauseEventRow {
  recorded_at: string;
  event: string;
  data: string | null;
}

function untilOf(data: string | null): number | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { until?: unknown };
    const u = Number(parsed?.until);
    return Number.isFinite(u) && u > 0 ? u : null;
  } catch {
    return null;
  }
}

/**
 * Pause spans from the phone's own event log: each `drive_paused {until}`
 * runs until its end time or the next `drive_resumed`, whichever came first.
 * A pause still running (`currentUntil`) with no start in the log is added
 * with an unknown start.
 */
export function pauseIntervals(events: PauseEventRow[], currentUntil: number | null): PauseInterval[] {
  const sorted = events
    .map((e) => ({ ...e, t: new Date(e.recorded_at).getTime() }))
    .filter((e) => Number.isFinite(e.t) && (e.event === "drive_paused" || e.event === "drive_resumed"))
    .sort((a, b) => a.t - b.t);
  const out: PauseInterval[] = [];
  let open: PauseInterval | null = null;
  for (const e of sorted) {
    if (e.event === "drive_paused") {
      const until = untilOf(e.data);
      if (until === null) continue;
      if (open) open.end = Math.min(open.end, e.t);
      open = { start: e.t, end: until };
      out.push(open);
    } else if (open) {
      open.end = Math.min(open.end, e.t);
      open = null;
    }
  }
  if (currentUntil !== null && Number.isFinite(currentUntil)) {
    // The last pause in the log, still open, is the running one.
    if (open) open.end = currentUntil;
    else out.push({ start: null, end: currentUntil });
  }
  return out;
}

/** The pause that covered `at`, if any. An unknown start is taken to be no
 *  earlier than MAX_PAUSE_MS before the end. */
export function pauseCovering(intervals: PauseInterval[], at: number): PauseInterval | null {
  for (const p of intervals) {
    const start = p.start ?? p.end - MAX_PAUSE_MS;
    if (at >= start && at < p.end) return p;
  }
  return null;
}

export type PauseNotice =
  | { kind: "active"; until: number; start: number | null; text: string }
  | { kind: "covered"; until: number; start: number | null; text: string };

/**
 * What the sheet says about a pause, or null for nothing.
 * - A pause running now is always mentioned, with a Resume button.
 * - A pause that has ended is mentioned only when it covered the time the
 *   driver says they set off.
 */
export function pauseNotice(args: {
  intervals: PauseInterval[];
  activeUntil: number | null;
  departAt: Date | null;
  now: number;
  describeActive: (until: number, now: number) => string;
}): PauseNotice | null {
  const { intervals, activeUntil, departAt, now } = args;
  if (departAt) {
    const hit = pauseCovering(intervals, departAt.getTime());
    if (hit && !(activeUntil !== null && hit.end === activeUntil && activeUntil > now)) {
      const end = new Date(hit.end);
      return {
        kind: "covered",
        until: hit.end,
        start: hit.start,
        text: `Recording was paused until ${clockTime(end)} on ${shortDay(end)}, so drives in that time weren't recorded.`,
      };
    }
  }
  if (activeUntil !== null && activeUntil > now) {
    const phrase = args.describeActive(activeUntil, now).replace(/^Paused/, "paused");
    const running = intervals.find((p) => p.end === activeUntil);
    return {
      kind: "active",
      until: activeUntil,
      start: running?.start ?? null,
      text: `Recording is ${phrase}, so drives in that time aren't being recorded.`,
    };
  }
  return null;
}
