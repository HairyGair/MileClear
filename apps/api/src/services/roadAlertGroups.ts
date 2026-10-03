// Road alerts (Oct 2026): one card per closure, new apart from ongoing.
// Pure, unit-tested.
//
// TomTom reports one closure several times: once per carriageway, once per
// night for overnight works, and once per street for an event closure
// (Sunday 4 Oct 2026 in Sunderland: 13 items for one road plan). One driver's
// list held 34 items that were really about 9 closures. Grouping here turns
// them back into one card each:
//
//   - same place, same kind, overlapping times      -> one card ("both ways")
//   - same place, same kind, same hours on several days -> one card
//     ("closed overnight, 19:00 to 05:00, on 5 nights from ...")
//   - closures with the exact same start and end within 3 km -> one card
//     ("B1600, A186 and nearby roads closed from 08:30 to 15:00 on Sun 4 Oct")
//
// A closure that has already been in place for more than 3 days is
// "ongoing": the driver has been driving round it, so it is listed apart,
// folded away, and never pushed or put on the dashboard card.

import type { RoadEvent, RoadEventSeverity } from "./roadEvents.js";
import { haversineMetres, ukLocalParts, type LatLng } from "./roadCorridor.js";
import {
  DEPARTURE_EFFECT_SLACK_MIN,
  daysPhrase,
  directionWord,
  eventHeadline,
  eventSentence,
  inEffectAt,
  isSerious,
  roadLabel,
  ukTimePhrase,
  type MatchedEvent,
} from "./roadAlertsRule.js";

export const ONGOING_AFTER_DAYS = 3;
/** Opposite carriageways and the same stretch reported twice sit within this. */
export const SAME_PLACE_M = 150;
/** One road plan (an event, a race) closing several streets at once. */
export const SAME_PLAN_M = 3000;
const MAX_SAMPLES = 24;

const SEVERITY_RANK: Record<RoadEventSeverity, number> = { closure: 2, major: 1, minor: 0 };

export interface AlertGroup {
  /** Stable id: the lead member's id. */
  id: string;
  members: MatchedEvent[];
  /** The member the words are built from: most serious, most driven. */
  lead: RoadEvent;
  severity: RoadEventSeverity;
  /** Most days the driver used any of the stretches. */
  days: number;
  when: "now" | "upcoming";
  ongoing: boolean;
  /** The window shown: the one in effect now, else the next one. */
  startAt: Date | null;
  endAt: Date | null;
  /** Distinct named roads, road numbers first. */
  roads: string[];
  bothDirections: boolean;
  /** Several streets closed by one plan. */
  multiPlace: boolean;
  /** The same hours on several days. */
  occurrences: number;
  recurring: boolean;
  /** Something a driver can act on: a road, a street, or junction names. */
  named: boolean;
  headline: string;
  sentence: string;
  centre: LatLng | null;
}

// ── Geometry and time relations ────────────────────────────────────

function samples(e: RoadEvent): LatLng[] {
  const pts = [...(e.lines ?? []).flat(), ...(e.points ?? [])];
  if (pts.length <= MAX_SAMPLES) return pts;
  const step = (pts.length - 1) / (MAX_SAMPLES - 1);
  return Array.from({ length: MAX_SAMPLES }, (_, i) => pts[Math.round(i * step)]);
}

function minDistance(a: LatLng[], b: LatLng[]): number {
  let best = Infinity;
  for (const p of a) for (const q of b) {
    const d = haversineMetres(p, q);
    if (d < best) best = d;
  }
  return best;
}

function kind(e: RoadEvent): string {
  return e.severity === "closure" ? "closure" : e.category;
}

function overlaps(a: RoadEvent, b: RoadEvent): boolean {
  const aStart = a.startAt?.getTime() ?? -Infinity, aEnd = a.endAt?.getTime() ?? Infinity;
  const bStart = b.startAt?.getTime() ?? -Infinity, bEnd = b.endAt?.getTime() ?? Infinity;
  return aStart < bEnd && bStart < aEnd;
}

function sameWindow(a: RoadEvent, b: RoadEvent): boolean {
  return (
    a.startAt != null && a.endAt != null && b.startAt != null && b.endAt != null &&
    a.startAt.getTime() === b.startAt.getTime() && a.endAt.getTime() === b.endAt.getTime()
  );
}

/** Same local start and end time of day, each under a day long. */
function sameHours(a: RoadEvent, b: RoadEvent): boolean {
  if (!a.startAt || !a.endAt || !b.startAt || !b.endAt) return false;
  const lenA = a.endAt.getTime() - a.startAt.getTime();
  const lenB = b.endAt.getTime() - b.startAt.getTime();
  if (lenA <= 0 || lenA >= 86400000 || Math.abs(lenA - lenB) > 60000) return false;
  return ukLocalParts(a.startAt).minutes === ukLocalParts(b.startAt).minutes;
}

// ── Grouping ───────────────────────────────────────────────────────

function rankMember(a: MatchedEvent, b: MatchedEvent): number {
  const s = SEVERITY_RANK[b.event.severity] - SEVERITY_RANK[a.event.severity];
  if (s !== 0) return s;
  const d = (b.event.delayMinutes ?? 0) - (a.event.delayMinutes ?? 0);
  if (d !== 0) return d;
  const n = Number(Boolean(b.event.road)) - Number(Boolean(a.event.road));
  if (n !== 0) return n;
  return b.days - a.days;
}

const isRoadNumber = (s: string) => /^[AMB]\d/.test(s);

function nameOf(e: RoadEvent): string | null {
  return e.road ?? e.placeName ?? null;
}

function inEffectNow(e: RoadEvent, now: Date): boolean {
  return inEffectAt(e, now);
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
const dayPhrase = (d: Date) => dayFmt.format(d).replace(",", "");
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => {
  const m = ukLocalParts(d).minutes;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** "from 08:30 to 15:00 on Sun 4 Oct", "from 22:00 today until 06:00 tomorrow". */
export function windowPhrase(start: Date | null, end: Date | null, now: Date): string {
  if (!start && !end) return "";
  if (!start) return `until ${ukTimePhrase(end!, now)}`;
  if (!end) return `from ${ukTimePhrase(start, now)}`;
  const s = ukLocalParts(start), e = ukLocalParts(end);
  if (s.dayKey === e.dayKey) {
    const n = ukLocalParts(now).dayKey;
    const tomorrow = ukLocalParts(new Date(now.getTime() + 86400000)).dayKey;
    const day = s.dayKey === n ? "today" : s.dayKey === tomorrow ? "tomorrow" : `on ${dayPhrase(start)}`;
    return `from ${hhmm(start)} to ${hhmm(end)} ${day}`;
  }
  return `from ${ukTimePhrase(start, now)} until ${ukTimePhrase(end, now)}`;
}

function describe(g: Omit<AlertGroup, "headline" | "sentence" | "named">, now: Date): { headline: string; sentence: string; named: boolean } {
  const lead = g.lead;
  const fallbackStretch =
    lead.from && lead.to && lead.from !== lead.to ? `${lead.from} to ${lead.to}` : lead.from ?? lead.to ?? null;
  const named = g.roads.length > 0 || fallbackStretch != null;

  if (g.multiPlace) {
    const list = g.roads.slice(0, 2);
    const label =
      list.length === 0 ? "Several roads near your usual route" : `${list.join(", ")} and nearby roads`;
    const verb = g.severity === "closure" ? "closed" : "affected";
    return {
      named: list.length > 0,
      headline: `${label} ${verb}`,
      sentence: `${label} ${verb} ${windowPhrase(g.startAt, g.endAt, now)}.`.replace(/ \./, "."),
    };
  }

  // One place: the lead's own words, with a name borrowed from any member
  // and no direction when both carriageways are shut.
  const withName: RoadEvent = {
    ...lead,
    road: lead.road ?? g.members.map((m) => m.event.road).find(Boolean) ?? null,
    placeName: lead.placeName ?? g.members.map((m) => m.event.placeName).find(Boolean) ?? null,
    placeTown: lead.placeTown ?? g.members.map((m) => m.event.placeTown).find(Boolean) ?? null,
    directionMode: g.bothDirections ? "none" : lead.directionMode,
  };
  let label = roadLabel(withName);
  if (label === "A road on your usual route" && fallbackStretch && g.severity === "closure") {
    label = fallbackStretch;
    withName.from = null;
    withName.to = null;
  }

  if (g.recurring && g.startAt && g.endAt) {
    const overnight = ukLocalParts(g.startAt).dayKey !== ukLocalParts(g.endAt).dayKey;
    const first = g.members.map((m) => m.event.startAt!).sort((a, b) => a.getTime() - b.getTime())[0];
    const last = g.members.map((m) => m.event.startAt!).sort((a, b) => b.getTime() - a.getTime())[0];
    const unit = overnight ? "nights" : "days";
    const what = g.severity === "closure" ? "Closed" : lead.description || "Roadworks";
    const both = g.bothDirections ? " in both directions" : "";
    return {
      named,
      headline: `${label} ${g.severity === "closure" ? "closed" : "roadworks"} ${overnight ? "overnight" : `${hhmm(g.startAt)} to ${hhmm(g.endAt)}`}`,
      sentence:
        `${what}${both}, ${hhmm(g.startAt)} to ${hhmm(g.endAt)}, on ${g.occurrences} ${unit} ` +
        `from ${dayPhrase(first)} to ${dayPhrase(last)}.`,
    };
  }

  let headline = eventHeadline(withName, label);
  let sentence = eventSentence(withName, now, label);
  if (g.bothDirections) {
    if (g.severity === "closure") headline = `${label} closed both ways`;
    sentence = sentence.replace(/\.$/, ", in both directions.");
  }
  if (g.ongoing && !g.endAt) sentence += " No end date given.";
  return { named, headline, sentence };
}

/** Group matched events into one card per closure. Every input lands in
 *  exactly one group. */
export function groupMatches(matches: MatchedEvent[], now: Date): AlertGroup[] {
  const n = matches.length;
  const parent = matches.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const pts = matches.map((m) => samples(m.event));
  const samePlaceCache = new Map<string, boolean>();
  const samePlace = (i: number, j: number) => {
    const k = `${i}:${j}`;
    let v = samePlaceCache.get(k);
    if (v === undefined) samePlaceCache.set(k, (v = minDistance(pts[i], pts[j]) <= SAME_PLACE_M));
    return v;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = matches[i].event, b = matches[j].event;
      if (a.source !== b.source || kind(a) !== kind(b)) continue;
      if (sameWindow(a, b) && minDistance(pts[i], pts[j]) <= SAME_PLAN_M) { union(i, j); continue; }
      if (samePlace(i, j) && (overlaps(a, b) || sameHours(a, b))) union(i, j);
    }
  }

  const buckets = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let arr = buckets.get(r);
    if (!arr) buckets.set(r, (arr = []));
    arr.push(i);
  }

  const groups: AlertGroup[] = [];
  for (const idx of buckets.values()) {
    const members = idx.map((i) => matches[i]).sort(rankMember);
    const lead = members[0].event;
    const events = members.map((m) => m.event);

    const live = events.filter((e) => inEffectNow(e, now));
    const when: "now" | "upcoming" = live.length > 0 ? "now" : "upcoming";
    let startAt: Date | null;
    let endAt: Date | null;
    if (when === "now") {
      const starts = live.map((e) => e.startAt);
      startAt = starts.some((s) => s == null) ? null : new Date(Math.min(...starts.map((s) => s!.getTime())));
      const ends = live.map((e) => e.endAt);
      endAt = ends.some((e) => e == null) ? null : new Date(Math.max(...ends.map((e) => e!.getTime())));
    } else {
      const next = events
        .filter((e) => e.startAt)
        .sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime())[0] ?? lead;
      startAt = next.startAt;
      endAt = next.endAt;
    }
    const ongoing = when === "now" && startAt != null && now.getTime() - startAt.getTime() > ONGOING_AFTER_DAYS * 86400000;

    // Distinct windows: more than one, all the same hours = recurring.
    const windows = new Map<string, RoadEvent>();
    for (const e of events) windows.set(`${e.startAt?.getTime()}|${e.endAt?.getTime()}`, e);
    const distinct = [...windows.values()];
    const recurring = distinct.length > 1 && distinct.every((e) => sameHours(e, distinct[0]));

    let multiPlace = false;
    for (let a = 0; a < idx.length && !multiPlace; a++)
      for (let b = a + 1; b < idx.length; b++)
        if (!samePlace(Math.min(idx[a], idx[b]), Math.max(idx[a], idx[b]))) { multiPlace = true; break; }

    const dirs = new Set(
      events.filter((e) => e.directionMode === "along").map((e) => directionWord(e.bearing)).filter(Boolean)
    );
    const bothDirections =
      !multiPlace && ((dirs.has("northbound") && dirs.has("southbound")) || (dirs.has("eastbound") && dirs.has("westbound")));

    const roadSet = new Map<string, number>();
    for (const m of members) {
      const name = nameOf(m.event);
      if (name && !roadSet.has(name)) roadSet.set(name, m.days);
    }
    const roads = [...roadSet.entries()]
      .sort((a, b) => Number(isRoadNumber(b[0])) - Number(isRoadNumber(a[0])) || b[1] - a[1])
      .map(([name]) => name);

    const all = pts[idx[0]];
    const centre = all.length > 0 ? all[Math.floor(all.length / 2)] : null;

    const base = {
      id: lead.id,
      members,
      lead,
      severity: lead.severity,
      days: Math.max(...members.map((m) => m.days)),
      when,
      ongoing,
      startAt,
      endAt,
      roads,
      bothDirections,
      multiPlace,
      occurrences: distinct.length,
      recurring,
      centre,
    };
    groups.push({ ...base, ...describe(base, now) });
  }
  return groups;
}

// ── Order ──────────────────────────────────────────────────────────

/** Now: worst first, then the roads they drive most. Upcoming: soonest
 *  first, then most driven. Ongoing: most driven first. */
export function sortGroups(groups: AlertGroup[]): { current: AlertGroup[]; upcoming: AlertGroup[]; ongoing: AlertGroup[] } {
  const current = groups.filter((g) => g.when === "now" && !g.ongoing);
  const ongoing = groups.filter((g) => g.when === "now" && g.ongoing);
  const upcoming = groups.filter((g) => g.when === "upcoming");
  current.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      (b.lead.delayMinutes ?? 0) - (a.lead.delayMinutes ?? 0) ||
      b.days - a.days
  );
  upcoming.sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0) || b.days - a.days);
  ongoing.sort((a, b) => b.days - a.days);
  return { current, upcoming, ongoing };
}

// ── Push ───────────────────────────────────────────────────────────

/** The one closure worth a pre-departure push, and how many others also
 *  qualify. Never an ongoing closure (they know it), never one with nothing
 *  to call it, never one already pushed (any of its parts). */
export function selectPushGroup(
  groups: AlertGroup[],
  opts: { departureAt: Date; sentEventIds: Set<string> }
): { pick: AlertGroup; extra: number } | null {
  const eligible = groups
    .filter((g) => !g.ongoing)
    .filter((g) => g.named)
    .filter((g) => g.members.some((m) => isSerious(m.event) && inEffectAt(m.event, opts.departureAt, DEPARTURE_EFFECT_SLACK_MIN)))
    .filter((g) => !g.members.some((m) => opts.sentEventIds.has(m.event.id)))
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        (b.lead.delayMinutes ?? 0) - (a.lead.delayMinutes ?? 0) ||
        b.days - a.days
    );
  if (eligible.length === 0) return null;
  return { pick: eligible[0], extra: eligible.length - 1 };
}

export interface RoadAlertCopy {
  title: string;
  body: string;
}

export function buildGroupPushCopy(g: AlertGroup, extra: number, _now: Date): RoadAlertCopy {
  const e = g.lead;
  const stretch = e.from && e.to && e.from !== e.to ? `${e.from} to ${e.to}` : e.from ?? e.to ?? null;
  const name = g.multiPlace
    ? g.roads.length > 0 ? `${g.roads.slice(0, 2).join(", ")} and nearby roads` : null
    : g.roads[0] ?? stretch;
  const title = name
    ? g.severity === "closure"
      ? `Before you set off: ${name} closed`
      : `Before you set off: delays on ${isRoadNumber(name) ? "the " : ""}${name}`
    : g.severity === "closure"
      ? "Before you set off: a closure on your usual route"
      : "Before you set off: delays on your usual route";
  const more = extra > 0 ? ` ${extra} more on your usual roads in the app.` : "";
  return { title, body: `${g.sentence} ${daysPhrase(g.days)}${more}` };
}
