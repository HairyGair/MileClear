// Rules for the "Add a past trip" form (add-trip PROPOSALS, Oct 2026).
//
// 61% of hand-added trips are back-filled more than a day after the drive, so
// the form no longer guesses: the day, the time and the start all begin empty
// (0.2, 0.3), and "where I am" fills in only when it is likely to be right.
// Before saving, the form looks for a trip MileClear already has at that time
// (0.4), on the phone and, for days older than the phone holds, on the server.
//
// Pure: no React, no database, no clock (callers pass `now`).

import { shortDay } from "../tracking/pauseRule";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// ── Days ────────────────────────────────────────────────────────────────────

/** Local midnight of the day `d` falls on. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The local day `n` days after `day` (negative goes back). Calendar days,
 *  not 24-hour steps, so the clocks changing never skips or repeats a day. */
export function addLocalDays(day: Date, n: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "2026-10-03" in local time (not toISOString, which is the UTC day). */
export function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "Today", "Yesterday", or the day by name: "Sat 3 Oct". */
export function dayLabel(day: Date, now: Date): string {
  if (sameLocalDay(day, now)) return "Today";
  if (sameLocalDay(day, addLocalDays(startOfLocalDay(now), -1))) return "Yesterday";
  return shortDay(day);
}

export type DayChipKey = "today" | "yesterday" | "picked";

/**
 * Which day chip is lit for `day`: Today, Yesterday, or the third chip, which
 * reads "Pick a day" until an older day is picked and then shows that day.
 * Null when no day is set (nothing is selected until the driver picks).
 */
export function selectedDayChip(day: Date | null, now: Date): DayChipKey | null {
  if (!day) return null;
  if (sameLocalDay(day, now)) return "today";
  if (sameLocalDay(day, addLocalDays(startOfLocalDay(now), -1))) return "yesterday";
  return "picked";
}

/** The departure for a day and a wheel time, local time, seconds zeroed. */
export function departureFor(day: Date, hours: number, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

/** A set-off time later than now can't be a past trip (and the API refuses it). */
export function isFutureDeparture(departAt: Date, now: Date): boolean {
  return departAt.getTime() > now.getTime();
}

/** The latest day the calendar offers: today. */
export function isFutureDay(day: Date, now: Date): boolean {
  return startOfLocalDay(day).getTime() > startOfLocalDay(now).getTime();
}

// ── "Where I am" ─────────────────────────────────────────────────────────────

/** The form fills From with where the phone is only this soon after a trip ended. */
export const WHERE_I_AM_WINDOW_MS = 60 * MINUTE_MS;

/**
 * Should From start as "where I am"? Only when the form opens within an hour
 * of a trip ending: the one time the phone's position is likely to be where a
 * trip being added today began. Every other time From starts empty (P5: the
 * sofa on 11 Oct was the default start of a trip from 1 Aug).
 */
export function shouldFillWhereIAm(args: { lastTripEndedAt: number | null; openedAt: number }): boolean {
  const { lastTripEndedAt, openedAt } = args;
  if (lastTripEndedAt == null || !Number.isFinite(lastTripEndedAt)) return false;
  const since = openedAt - lastTripEndedAt;
  return since >= 0 && since <= WHERE_I_AM_WINDOW_MS;
}

/** A From filled in as "where I am" stays only while the trip is today (or
 *  no day is picked yet). Picking an older day clears it. */
export function keepWhereIAm(day: Date | null, now: Date): boolean {
  return day == null || sameLocalDay(day, now);
}

// ── How far back the phone holds trips ──────────────────────────────────────

/** The phone fetches the last 90 days of trips, up to 100 of them
 *  (lib/sync/hydrate.ts). Older ones are only on the server. */
export const PHONE_HOLDS_DAYS = 90;
export const PHONE_HOLDS_ROWS = 100;

/**
 * The earliest moment the phone can be trusted to have every trip from. Ninety
 * days back, or later when the driver has more than 100 trips in that time
 * (then only the newest 100 are certain to be on the phone).
 */
export function phoneHoldsFrom(args: { now: number; hundredthNewestStart: number | null }): number {
  const ninety = args.now - PHONE_HOLDS_DAYS * DAY_MS;
  const nth = args.hundredthNewestStart;
  return nth != null && Number.isFinite(nth) ? Math.max(ninety, nth) : ninety;
}

/** Ask the server too when the window starts before the phone's trips do. */
export function needsServerCheck(args: { windowStart: number; phoneHoldsFrom: number }): boolean {
  return args.windowStart < args.phoneHoldsFrom;
}

// ── The button ──────────────────────────────────────────────────────────────

export interface FormFilled {
  hasFrom: boolean;
  hasTo: boolean;
  /** Typed miles, for a trip with no end place. */
  hasMiles: boolean;
  hasDay: boolean;
  hasTime: boolean;
  /** The day and time put the start after now. */
  timeInFuture: boolean;
}

/**
 * What the Add button says while it can't be pressed, or null when the trip
 * can be added. One plain ask, the most useful first.
 */
export function missingForSave(f: FormFilled): string | null {
  const where = !f.hasFrom || (!f.hasTo && !f.hasMiles);
  const when = !f.hasDay || !f.hasTime;
  if (where && when) return "Add where you went and when";
  if (!f.hasFrom) return "Add where you set off from";
  if (!f.hasTo && !f.hasMiles) return "Add where you went";
  if (!f.hasDay) return "Add which day";
  if (!f.hasTime) return "Add when you set off";
  if (f.timeInFuture) return "Set off time is later than now";
  return null;
}

// ── The calendar ("Pick a day") ─────────────────────────────────────────────

/**
 * One month as weeks, Monday first, with null for the blanks before the 1st
 * and after the last day. `month` is 0-based, as Date uses.
 */
export function monthGrid(year: number, month: number): Array<Array<Date | null>> {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  // getDay(): Sunday 0. Monday-first column of the 1st.
  const lead = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "October 2026". */
export function monthTitle(year: number, month: number): string {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[month]} ${year}`;
}

// ── The worked-out arrival ──────────────────────────────────────────────────

/**
 * The arrival the driver typed with "Change": the hour and minute on the day
 * the trip set off, or the next day when that clock time is before the
 * set-off (a drive past midnight).
 */
export function arrivalAfter(start: Date, hours: number, minutes: number): Date {
  const same = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hours, minutes, 0, 0);
  if (same.getTime() > start.getTime()) return same;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, hours, minutes, 0, 0);
}

// ── What else is on that day ────────────────────────────────────────────────

export interface DayTrip {
  startedAt: string;
  endedAt: string | null;
}

function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function tripsOnDay<T extends DayTrip>(day: Date, trips: T[]): T[] {
  return trips
    .filter((t) => sameLocalDay(new Date(t.startedAt), day))
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
}

/** "1 trip, 13:20 to 13:45", "2 trips, 08:35 and 13:20", "4 trips, 08:35 to 17:10". */
function tripsWords(list: DayTrip[]): string {
  const n = list.length;
  const first = new Date(list[0].startedAt);
  if (n === 1) {
    const end = list[0].endedAt ? new Date(list[0].endedAt) : null;
    return end && end.getTime() > first.getTime() ? `1 trip, ${hm(first)} to ${hm(end)}` : `1 trip, at ${hm(first)}`;
  }
  if (n === 2) return `2 trips, ${hm(first)} and ${hm(new Date(list[1].startedAt))}`;
  const last = list[n - 1];
  const lastEnd = new Date(last.endedAt ?? last.startedAt);
  return `${n} trips, ${hm(first)} to ${hm(lastEnd)}`;
}

/**
 * The grey line under When, so the driver sees the day before adding to it
 * (mockup a-filled): "Also on Sat 3 Oct: 1 trip, 13:20 to 13:45". Null when
 * the day has none. `excludeIds` leaves out the trip already pointed at.
 */
export function dayTripsLine(day: Date, trips: Array<DayTrip & { id: string }>, now: Date, excludeIds: string[] = []): string | null {
  const list = tripsOnDay(day, trips.filter((t) => !excludeIds.includes(t.id)));
  if (list.length === 0) return null;
  const which = sameLocalDay(day, now) ? "Also today" : `Also on ${shortDay(day)}`;
  return `${which}: ${tripsWords(list)}`;
}

/** The calendar's line for the picked day: "Sat 3 Oct: 1 trip so far, 13:20
 *  to 13:45" or "Sun 4 Oct has none". */
export function calendarDayLine(day: Date, trips: DayTrip[]): string {
  const list = tripsOnDay(day, trips);
  if (list.length === 0) return `${shortDay(day)} has none`;
  const words = tripsWords(list).replace(/^(\d+ trips?)/, "$1 so far");
  return `${shortDay(day)}: ${words}`;
}

/** Local day keys ("2026-10-03") that have at least one trip, for the dots. */
export function tripDayKeys(trips: DayTrip[]): Set<string> {
  const keys = new Set<string>();
  for (const t of trips) {
    const d = new Date(t.startedAt);
    if (Number.isFinite(d.getTime())) keys.add(localDayKey(d));
  }
  return keys;
}

// ── "Add the next trip" and "Add the way back" (PROPOSALS 0.7) ──────────────

export type ChainKind = "next" | "way_back";

export interface SavedTripFacts {
  startLat: number;
  startLng: number;
  startAddress: string | null;
  startName: string;
  endLat: number | null;
  endLng: number | null;
  endAddress: string | null;
  endName: string | null;
  startedAt: Date;
  endedAt: Date;
  classification: string;
  platformTag?: string | null;
  businessPurpose?: string | null;
  category?: string | null;
  vehicleId?: string | null;
}

/** The way back needs both ends; the next trip only a day (its From is this
 *  trip's To when there is one). */
export function canChain(kind: ChainKind, t: SavedTripFacts): boolean {
  if (kind === "way_back") return t.endLat != null && t.endLng != null;
  return true;
}

/**
 * The params that open the form on the next trip. The day carries over, the
 * set-off time stays empty but the wheel opens just after this one arrived,
 * and Business or Personal with its app or purpose carries over.
 */
export function chainParams(kind: ChainKind, t: SavedTripFacts): Record<string, string> {
  const p: Record<string, string> = {
    mode: "manual",
    source: "saved_card",
    chain: kind,
    prefillDay: localDayKey(t.startedAt),
    prefillAfter: t.endedAt.toISOString(),
  };
  if (t.endLat != null && t.endLng != null) {
    p.prefillFromLat = String(t.endLat);
    p.prefillFromLng = String(t.endLng);
    if (t.endAddress) p.prefillFromAddress = t.endAddress;
  }
  if (kind === "way_back") {
    p.prefillToLat = String(t.startLat);
    p.prefillToLng = String(t.startLng);
    if (t.startAddress) p.prefillToAddress = t.startAddress;
  }
  if (t.classification === "business" || t.classification === "personal") p.prefillClassification = t.classification;
  if (t.platformTag) p.prefillPlatform = t.platformTag;
  if (t.businessPurpose) p.prefillPurpose = t.businessPurpose;
  if (t.category) p.prefillCategory = t.category;
  if (t.vehicleId) p.prefillVehicleId = t.vehicleId;
  return p;
}

/** The grey line on each saved-card button. */
export function chainSubtitle(kind: ChainKind, t: SavedTripFacts, now: Date): string {
  const day = sameLocalDay(t.startedAt, now) ? "today" : shortDay(t.startedAt);
  if (kind === "way_back") {
    return `${t.endName ?? "There"} to ${t.startName}, same day`;
  }
  const from = t.endName ? `From ${t.endName}, ` : "";
  return `${from}${day}, after ${hm(t.endedAt)}`;
}

/** "2026-10-03" back to that local day, or null. */
export function parseDayKey(key: string | null | undefined): Date | null {
  const m = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) && d.getDate() === Number(m[3]) ? d : null;
}
