// Road alerts trial (2 Oct 2026): what to send, when, and in what words.
// Pure, unit-tested. The IO lives in services/roadAlerts.ts, services/
// tomtomTraffic.ts, services/streetManager.ts and jobs/roadAlerts.ts.
//
// Product shape (deliberately narrow; we are not a sat-nav):
//   - One push at most per UK day, 25-45 minutes before the driver usually
//     sets off on that weekday, only for a SERIOUS event (closure, or lanes
//     shut / incident with a 15+ minute delay) on a road they use often, in
//     their direction, in effect when they usually leave. Never the same
//     event twice, never while they are likely driving.
//   - A Road alerts screen: serious events on their roads now, plus planned
//     closures and roadworks on their roads in the next 7 days.

import type { RoadEvent, RoadEventSeverity } from "./roadEvents.js";
import { ukLocalParts } from "./roadCorridor.js";

export const ROAD_ALERT_SENT_EVENT = "road_alert.sent";
/** Sent events this far back are never sent again. */
export const DEDUPE_LOOKBACK_DAYS = 14;
export const MAX_ROAD_ALERTS_PER_DAY = 1;
/** Planned items on the screen: the next 7 days. */
export const UPCOMING_DAYS = 7;
/** An event starting up to this long after the usual departure still counts
 *  (they will be on the road by then). */
export const DEPARTURE_EFFECT_SLACK_MIN = 60;

export interface MatchedEvent {
  event: RoadEvent;
  /** Days in the window the driver used the matched stretch. */
  days: number;
}

const SEVERITY_RANK: Record<RoadEventSeverity, number> = { closure: 2, major: 1, minor: 0 };

export function isSerious(e: RoadEvent): boolean {
  return e.severity === "closure" || e.severity === "major";
}

/** Worth a push only when we can say where: a road name, or junctions or
 *  street names for the stretch. Live TomTom data (2 Oct 2026) had 190
 *  closures in Tyne and Wear, many on unnamed side roads; "a road you use is
 *  closed" gives a driver nothing to act on. Those stay on the screen. */
export function isNamedForPush(e: RoadEvent): boolean {
  return Boolean(e.road || e.from || e.to);
}

export function inEffectAt(e: RoadEvent, at: Date, slackMin: number = 0): boolean {
  const t = at.getTime();
  if (e.startAt && e.startAt.getTime() > t + slackMin * 60000) return false;
  if (e.endAt && e.endAt.getTime() <= t) return false;
  return true;
}

function rank(a: MatchedEvent, b: MatchedEvent): number {
  const s = SEVERITY_RANK[b.event.severity] - SEVERITY_RANK[a.event.severity];
  if (s !== 0) return s;
  const d = (b.event.delayMinutes ?? 0) - (a.event.delayMinutes ?? 0);
  if (d !== 0) return d;
  return b.days - a.days;
}

/** Event ids already pushed, from road_alert.sent AppEvent metadata. */
export function sentEventIdsFrom(metadatas: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const m of metadatas) {
    const ids = (m as { eventIds?: unknown } | null)?.eventIds;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") out.add(id);
  }
  return out;
}

export interface DrivingSignals {
  lastTripStartedAt: Date | null;
  lastTripEndedAt: Date | null;
  autoRecordingActive: boolean | null;
  recordingStartedAt: Date | null;
  activeShiftStartedAt: Date | null;
}

/** "Never while they're likely driving": a trip started or ended in the last
 *  10 minutes, a trip still open, a live recording, or an open shift. */
export function isLikelyDriving(s: DrivingSignals, now: Date): boolean {
  const t = now.getTime();
  const within = (d: Date | null, ms: number) => d != null && t - d.getTime() <= ms && t - d.getTime() >= -ms;
  if (within(s.lastTripStartedAt, 10 * 60000) || within(s.lastTripEndedAt, 10 * 60000)) return true;
  if (s.lastTripStartedAt && !s.lastTripEndedAt && within(s.lastTripStartedAt, 6 * 3600000)) return true;
  if (s.autoRecordingActive && within(s.recordingStartedAt, 4 * 3600000)) return true;
  if (within(s.activeShiftStartedAt, 16 * 3600000)) return true;
  return false;
}

// ── Words ──────────────────────────────────────────────────────────

/** 4-way travel direction for a numbered road ("northbound"), or null. */
export function directionWord(bearing: number | null): string | null {
  if (bearing == null) return null;
  const b = ((bearing % 360) + 360) % 360;
  if (b >= 315 || b < 45) return "northbound";
  if (b < 135) return "eastbound";
  if (b < 225) return "southbound";
  return "westbound";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "10:00", "06:00 tomorrow", "18:00 on Sat 10 Oct" (UK time). */
export function ukTimePhrase(at: Date, now: Date): string {
  const a = ukLocalParts(at);
  const n = ukLocalParts(now);
  const hhmm = `${pad(Math.floor(a.minutes / 60))}:${pad(a.minutes % 60)}`;
  if (a.dayKey === n.dayKey) return hhmm;
  const tomorrow = ukLocalParts(new Date(now.getTime() + 24 * 3600000)).dayKey;
  if (a.dayKey === tomorrow) return `${hhmm} tomorrow`;
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London",
  }).format(at);
  return `${hhmm} on ${day.replace(",", "")}`;
}

/** "M6 southbound", "A1(M)", "Church Street, Leeds". */
export function roadLabel(e: RoadEvent): string {
  if (e.source === "street_manager") {
    if (e.road && e.town) return `${e.road}, ${e.town}`;
    return e.road ?? e.town ?? "A road on your usual route";
  }
  const dir = e.directionMode === "along" ? directionWord(e.bearing) : null;
  if (e.road) return dir ? `${e.road} ${dir}` : e.road;
  if (e.placeName) return e.placeTown ? `${e.placeName}, ${e.placeTown}` : e.placeName;
  return "A road on your usual route";
}

function stretch(e: RoadEvent): string {
  if (e.from && e.to && e.from !== e.to) return ` from ${e.from} to ${e.to}`;
  if (e.from || e.to) return ` at ${e.from ?? e.to}`;
  return "";
}

function untilPhrase(e: RoadEvent, now: Date): string {
  if (!e.endAt) return "";
  // Live incidents carry an estimate; planned works a booked end.
  const about = e.source === "tomtom" && !e.future ? "about " : "";
  return ` until ${about}${ukTimePhrase(e.endAt, now)}`;
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** One-line headline for the screen: "M6 southbound closed". */
export function eventHeadline(e: RoadEvent, label: string = roadLabel(e)): string {
  if (e.severity === "closure") return `${label} closed`;
  switch (e.category) {
    case "lane_closed": return `${label}: lanes closed`;
    case "accident": return `${label}: accident`;
    case "broken_down_vehicle": return `${label}: broken-down vehicle`;
    case "roadworks": return `${label}: roadworks`;
    case "flooding": return `${label}: flooding`;
    default: return `${label}: ${lowerFirst(e.description)}`;
  }
}

/** Plain sentence for the screen and the push body. */
export function eventSentence(e: RoadEvent, now: Date, label: string = roadLabel(e)): string {
  const until = untilPhrase(e, now);
  if (e.severity === "closure") {
    const why = e.source === "street_manager" ? " for roadworks" : "";
    return `${label} is closed${stretch(e)}${why}${until}.`;
  }
  const what = lowerFirst(e.description || "incident");
  const delay = e.delayMinutes && e.delayMinutes > 0 ? `, delays of about ${e.delayMinutes} minutes` : "";
  return `${label}: ${what}${stretch(e)}${delay}${until}.`;
}

export function daysPhrase(days: number): string {
  return `You've driven this way on ${days} ${days === 1 ? "day" : "days"} in the last 6 weeks.`;
}

// ── Screen ─────────────────────────────────────────────────────────

/** Sort and split matched events for the Road alerts screen. Current: serious
 *  events in effect now. Upcoming: closures (any source) and serious events,
 *  plus Street Manager roadworks, starting in the next 7 days. */
export function splitForScreen(matches: MatchedEvent[], now: Date): { current: MatchedEvent[]; upcoming: MatchedEvent[] } {
  const horizon = now.getTime() + UPCOMING_DAYS * 24 * 3600000;
  const current: MatchedEvent[] = [];
  const upcoming: MatchedEvent[] = [];
  for (const m of matches) {
    const e = m.event;
    if (e.endAt && e.endAt.getTime() <= now.getTime()) continue;
    const started = !e.startAt || e.startAt.getTime() <= now.getTime();
    if (started) {
      if (isSerious(e)) current.push(m);
    } else if (e.startAt!.getTime() <= horizon) {
      if (isSerious(e) || e.source === "street_manager" || e.category === "roadworks") upcoming.push(m);
    }
  }
  current.sort(rank);
  upcoming.sort((a, b) => (a.event.startAt?.getTime() ?? 0) - (b.event.startAt?.getTime() ?? 0));
  return { current, upcoming };
}

// ── Offer card eligibility ─────────────────────────────────────────

/** Rough UK box; TomTom covers all of it, Street Manager only England. */
export function inUk(lat: number, lng: number): boolean {
  return lat >= 49.8 && lat <= 60.95 && lng >= -8.7 && lng <= 1.9;
}

export const OFFER_MIN_TRIPS = 10;
export const OFFER_MIN_DAYS = 3;

/** Enough recorded driving in the UK in the last six weeks to build a corridor. */
export function offerEligible(trips: { startedAt: Date; startLat: number; startLng: number }[]): boolean {
  const uk = trips.filter((t) => inUk(t.startLat, t.startLng));
  if (uk.length < OFFER_MIN_TRIPS) return false;
  const days = new Set(uk.map((t) => ukLocalParts(t.startedAt).dayKey));
  return days.size >= OFFER_MIN_DAYS;
}
