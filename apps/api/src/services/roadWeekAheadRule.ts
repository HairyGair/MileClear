// "Next week on your roads" (Oct 2026): pure rules for the Sunday evening
// week-ahead push and the "Coming up this week" section of the Road alerts
// screen. Unit-tested. The IO lives in services/roadWeekAhead.ts and
// jobs/roadWeekAhead.ts.
//
// What it picks, for one driver: PLANNED street works (DfT Street Manager)
// that START inside the week in view on the roads they use often. Most
// disruptive first: road closures, then works on traffic-sensitive streets,
// then lights, lane closures and the like. Works already under way are left
// out (the pre-departure alert and the "On your roads now" list cover them),
// so are dismissed ones, and the same street dug by the same company is one
// item however many permits it holds. At most 5 items plus "and N more".

import type { RoadEvent } from "./roadEvents.js";
import { ukLocalParts } from "./roadCorridor.js";
import { groupMatches, withoutDismissed, type AlertGroup } from "./roadAlertGroups.js";
import type { MatchedEvent } from "./roadAlertsRule.js";

export const WEEK_AHEAD_SENT_EVENT = "road_alert.week_ahead_sent";
export const WEEK_AHEAD_SKIPPED_EVENT = "road_alert.week_ahead_skipped";
export const WEEK_AHEAD_TITLE = "Next week on your roads";
export const WEEK_AHEAD_MAX_ITEMS = 5;
/** Send from 18:00 UK on Sunday. The window runs to 19:59 so a driver who is
 *  on the road at 18:00 gets it on a later 30-minute tick instead. */
export const WEEK_AHEAD_SEND_HOUR = 18;
export const WEEK_AHEAD_SEND_LAST_HOUR = 19;

/** Off unless ROAD_WEEK_AHEAD_PUSH is exactly "1". */
export function roadWeekAheadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ROAD_WEEK_AHEAD_PUSH === "1";
}

/** Sunday, 18:00 to 19:59 UK time (BST or GMT, from Intl). */
export function inWeekAheadSendWindow(now: Date): boolean {
  const p = ukLocalParts(now);
  const hour = Math.floor(p.minutes / 60);
  return p.weekday === 0 && hour >= WEEK_AHEAD_SEND_HOUR && hour <= WEEK_AHEAD_SEND_LAST_HOUR;
}

// ── Calendar ──────────────────────────────────────────────────────

function addDaysToKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** UTC instant of 00:00 UK time on a "YYYY-MM-DD" day (BST or GMT). */
export function ukMidnight(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  for (const offset of [-3600000, 0]) {
    const t = new Date(utcMidnight + offset);
    const p = ukLocalParts(t);
    if (p.dayKey === dayKey && p.minutes === 0) return t;
  }
  return new Date(utcMidnight);
}

/** ISO 8601 week of a "YYYY-MM-DD" day: "2026-W43". */
export function isoWeekKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7; // Mon 1 .. Sun 7
  date.setUTCDate(date.getUTCDate() + 4 - dow); // the Thursday of this week
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface WeekAheadWindow {
  /** Inclusive. */
  start: Date;
  /** Exclusive: 00:00 UK on the Monday after. */
  end: Date;
  /** ISO week of the week in view, for the once-a-week dedupe. */
  weekKey: string;
  /** "next" on a Sunday (the Monday to Sunday ahead), else "this" (the rest
   *  of the current week). */
  which: "this" | "next";
}

/** The week in view. On a Sunday (when the push goes) it is the coming
 *  Monday 00:00 to Sunday 23:59 UK; on any other day, now to the end of
 *  this Sunday, so the screen still has something to say mid-week. */
export function weekAheadWindow(now: Date): WeekAheadWindow {
  const p = ukLocalParts(now);
  if (p.weekday === 0) {
    const monday = addDaysToKey(p.dayKey, 1);
    return { start: ukMidnight(monday), end: ukMidnight(addDaysToKey(monday, 7)), weekKey: isoWeekKey(monday), which: "next" };
  }
  const monday = addDaysToKey(p.dayKey, 1 - p.weekday);
  return { start: now, end: ukMidnight(addDaysToKey(monday, 7)), weekKey: isoWeekKey(monday), which: "this" };
}

// ── Selection ─────────────────────────────────────────────────────

/** What Street Manager says about the works behind one RoadEvent. */
export interface WorksMeta {
  trafficManagement: string;
  isTrafficSensitive: boolean;
  /** "planned", "in_progress", "completed" (any case or spacing), or null. */
  workStatus: string | null;
  promoter: string | null;
}

export interface WeekAheadCandidate extends MatchedEvent {
  works: WorksMeta;
}

export interface WeekAheadEntry {
  group: AlertGroup;
  /** 0 road closure, 1 traffic-sensitive street, 2 lights / lanes / other. */
  tier: number;
  trafficManagement: string;
  trafficSensitive: boolean;
  /** Short works company name for the copy ("BT"), or null. */
  promoter: string | null;
}

export interface WeekAheadSelection {
  items: WeekAheadEntry[];
  /** Further items past the cap. */
  more: number;
  total: number;
}

const SIGNALS_AND_LANES = new Set([
  "lane_closure",
  "two_way_signals",
  "multi_way_signals",
  "stop_go_boards",
  "contra_flow",
  "convoy_workings",
]);

export function disruptionTier(w: Pick<WorksMeta, "trafficManagement" | "isTrafficSensitive">): number | null {
  if (w.trafficManagement === "road_closure") return 0;
  if (w.isTrafficSensitive) return 1;
  if (SIGNALS_AND_LANES.has(w.trafficManagement)) return 2;
  return null;
}

function normStatus(s: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** "BRITISH TELECOMMUNICATIONS PLC" -> "BT", "Northumbrian Water Limited" ->
 *  "Northumbrian Water". Null when there is nothing short enough to say. */
export function shortPromoter(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.replace(/\s+/g, " ").trim();
  if (/british telecom|^bt\b|openreach/i.test(s)) return /openreach/i.test(s) ? "Openreach" : "BT";
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  s = s.replace(/[\s,.]+(limited|ltd|plc|llp|uk)\.?$/i, "").trim();
  s = s.replace(/[\s,.]+(limited|ltd|plc|llp)\.?$/i, "").trim();
  if (s === s.toUpperCase() && /[A-Z]{4,}/.test(s)) {
    s = s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }
  if (!s || s.length > 32) return null;
  return s;
}

function sameStreetKey(g: AlertGroup, promoter: string | null): string | null {
  const road = g.roads[0];
  if (!road || !promoter) return null;
  const town = (g.lead.town ?? "").toLowerCase();
  return `${road.toLowerCase()}|${town}|${promoter.toLowerCase()}`;
}

function rankEntries(a: WeekAheadEntry, b: WeekAheadEntry): number {
  return (
    a.tier - b.tier ||
    Number(b.trafficSensitive) - Number(a.trafficSensitive) ||
    b.group.days - a.group.days ||
    (a.group.startAt?.getTime() ?? 0) - (b.group.startAt?.getTime() ?? 0)
  );
}

/**
 * Planned works on this driver's usual roads that start inside the window,
 * most disruptive first. `candidates` are already matched to the driver's
 * corridor; anything not from Street Manager is ignored.
 */
export function selectWeekAhead(
  candidates: WeekAheadCandidate[],
  opts: { now: Date; window: Pick<WeekAheadWindow, "start" | "end">; dismissed?: Set<string>; max?: number }
): WeekAheadSelection {
  const { now, window } = opts;
  const max = opts.max ?? WEEK_AHEAD_MAX_ITEMS;
  const worksById = new Map<string, WorksMeta>();
  const kept: MatchedEvent[] = [];
  for (const c of candidates) {
    const e: RoadEvent = c.event;
    if (e.source !== "street_manager") continue;
    const status = normStatus(c.works.workStatus);
    if (status === "in_progress" || status === "completed" || status === "cancelled") continue;
    if (!e.startAt) continue;
    const start = e.startAt.getTime();
    // Already under way (or due to have started): not "coming up".
    if (start <= now.getTime()) continue;
    if (start < window.start.getTime() || start >= window.end.getTime()) continue;
    if (e.endAt && e.endAt.getTime() <= start) continue;
    if (disruptionTier(c.works) == null) continue;
    worksById.set(e.id, c.works);
    kept.push({ event: e, days: c.days });
  }
  if (kept.length === 0) return { items: [], more: 0, total: 0 };

  const groups = withoutDismissed(groupMatches(kept, now), opts.dismissed ?? new Set());

  const entries: WeekAheadEntry[] = groups.map((g) => {
    const metas = g.members.map((m) => worksById.get(m.event.id)!).filter(Boolean);
    const tiers = metas.map((w) => disruptionTier(w) ?? 3);
    const tier = Math.min(...tiers);
    const leadMeta = worksById.get(g.lead.id) ?? metas[0];
    return {
      group: g,
      tier,
      trafficManagement: leadMeta.trafficManagement,
      trafficSensitive: metas.some((w) => w.isTrafficSensitive),
      promoter: shortPromoter(leadMeta.promoter),
    };
  });

  // The same street dug by the same company is one item: keep the most
  // disruptive part and carry every permit's ids, so dismissing it hides all.
  const byKey = new Map<string, WeekAheadEntry[]>();
  const merged: WeekAheadEntry[] = [];
  for (const e of entries) {
    const key = sameStreetKey(e.group, e.promoter);
    if (!key) { merged.push(e); continue; }
    let arr = byKey.get(key);
    if (!arr) byKey.set(key, (arr = []));
    arr.push(e);
  }
  for (const arr of byKey.values()) {
    arr.sort(rankEntries);
    const best = arr[0];
    if (arr.length === 1) { merged.push(best); continue; }
    const members = arr.flatMap((e) => e.group.members);
    merged.push({
      ...best,
      trafficSensitive: arr.some((e) => e.trafficSensitive),
      group: { ...best.group, members, days: Math.max(...arr.map((e) => e.group.days)) },
    });
  }

  merged.sort(rankEntries);
  return { items: merged.slice(0, max), more: Math.max(0, merged.length - max), total: merged.length };
}

// ── Words ─────────────────────────────────────────────────────────

const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/London" });

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "Durham Road closed", "temporary lights on Durham Road". */
export function worksPhrase(trafficManagement: string, name: string | null): string {
  if (!name) {
    return trafficManagement === "road_closure" ? "a road closure on your usual roads" : "roadworks on your usual roads";
  }
  switch (trafficManagement) {
    case "road_closure": return `${name} closed`;
    case "lane_closure": return `lane closures on ${name}`;
    case "two_way_signals":
    case "multi_way_signals": return `temporary lights on ${name}`;
    case "stop_go_boards": return `stop/go boards on ${name}`;
    case "contra_flow": return `a contraflow on ${name}`;
    case "convoy_workings": return `convoy working on ${name}`;
    default: return `roadworks on ${name}`;
  }
}

export interface WeekAheadCopy {
  title: string;
  body: string;
}

/** "Durham Road closed from Tue (BT works), plus 2 more". Null when there
 *  is nothing to say. */
export function buildWeekAheadPushCopy(sel: WeekAheadSelection): WeekAheadCopy | null {
  const top = sel.items[0];
  if (!top) return null;
  const g = top.group;
  const name = g.roads[0] ?? g.lead.town ?? null;
  const from = g.startAt ? ` from ${weekdayFmt.format(g.startAt)}` : "";
  const who = top.promoter ? ` (${top.promoter} works)` : "";
  const others = sel.total - 1;
  const more = others > 0 ? `, plus ${others} more` : "";
  return { title: WEEK_AHEAD_TITLE, body: `${capitalise(worksPhrase(top.trafficManagement, name))}${from}${who}${more}` };
}
