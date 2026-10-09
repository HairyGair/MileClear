/**
 * Pure helpers for the running odometer (docs/odometer-oct2026/SPEC-UX.md).
 * No React, no Date.now() unless `now` is omitted, so every rule is unit tested.
 * All copy comes from SPEC-UX section 8. UK English, no em dashes.
 */

import type {
  OdometerCurrent,
  OdometerDay,
  OdometerReadingRow,
  VehicleListOdometer,
} from "../api/odometer";

export const MAX_READING_MILES = 999_999;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

// ── Formatting ───────────────────────────────────────────────────────

/** Whole miles with UK thousands separators: 45262 -> "45,262". */
export function formatOdo(miles: number): string {
  const n = Math.round(miles);
  const sign = n < 0 ? "-" : "";
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** One decimal for day mile counts: 40.1 */
export function formatDayMiles(miles: number): string {
  return (Math.round(miles * 10) / 10).toFixed(1);
}

function milesWord(n: number): string {
  return Math.round(n) === 1 ? "mile" : "miles";
}

/** "Wed 8 Oct" */
export function shortDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Wed 8 Oct, 18:40" */
export function shortDateTime(d: Date): string {
  return `${shortDate(d)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "12 Mar 2026" */
export function motDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Wednesday 8 October" for screen readers. */
export function longDate(d: Date): string {
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** Local "YYYY-MM-DD". */
export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse "YYYY-MM-DD" as a local date at noon (safe across clock changes). */
export function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Reading input ────────────────────────────────────────────────────

export type ParsedReading =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "ok"; miles: number };

/** Digits and at most one decimal point. Commas and spaces are ignored. */
export function sanitiseReadingInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

export function parseReadingInput(text: string): ParsedReading {
  const cleaned = sanitiseReadingInput(text.trim());
  if (cleaned === "" || cleaned === ".") return { kind: "empty" };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_READING_MILES) return { kind: "invalid" };
  return { kind: "ok", miles: n };
}

// ── Checks before saving (SPEC-UX 1.3, in the spec's order) ──────────

export interface MotHint {
  /** Test date. */
  date: Date;
  miles: number;
}

export type ReadingCheck =
  | { kind: "ok" }
  | { kind: "error"; message: string }
  | { kind: "blocked"; earlierMiles: number; earlierAt: Date }
  | { kind: "confirm"; title: string; body: string };

export interface CheckInput {
  text: string;
  readAt: Date;
  now: Date;
  /** The current estimate, if the vehicle has one. */
  estimateMiles: number | null;
  readings: readonly OdometerReadingRow[];
  mot: MotHint | null;
}

/** The latest accepted reading at or before `at`. Newest-first lists win ties. */
export function latestAcceptedBefore(
  readings: readonly OdometerReadingRow[],
  at: Date
): OdometerReadingRow | null {
  let best: OdometerReadingRow | null = null;
  let bestMs = -Infinity;
  for (const r of readings) {
    if (!r.used) continue;
    const ms = new Date(r.readAt).getTime();
    if (Number.isNaN(ms) || ms > at.getTime()) continue;
    if (ms > bestMs) {
      best = r;
      bestMs = ms;
    }
  }
  return best;
}

export function checkReading(input: CheckInput): ReadingCheck {
  const parsed = parseReadingInput(input.text);
  if (parsed.kind === "empty") {
    return { kind: "error", message: "Type the reading from your dashboard." };
  }
  if (parsed.kind === "invalid") {
    return { kind: "error", message: "That doesn't look like an odometer reading. Check it and try again." };
  }
  const miles = parsed.miles;
  if (input.readAt.getTime() > input.now.getTime()) {
    return { kind: "error", message: "That time hasn't happened yet." };
  }

  const earlier = latestAcceptedBefore(input.readings, input.readAt);
  if (earlier && miles < earlier.readingMiles) {
    return { kind: "blocked", earlierMiles: earlier.readingMiles, earlierAt: new Date(earlier.readAt) };
  }

  if (input.estimateMiles != null && miles - input.estimateMiles > 1000) {
    const diff = miles - input.estimateMiles;
    return {
      kind: "confirm",
      title: `That's ${formatOdo(diff)} miles more than we expected`,
      body: `We estimated about ${formatOdo(input.estimateMiles)}. Is ${formatOdo(miles)} right?`,
    };
  }

  if (!earlier && input.mot) {
    const mot = input.mot;
    const when = motDate(mot.date);
    if (miles < mot.miles) {
      return {
        kind: "confirm",
        title: "That's lower than your last MOT",
        body: `Your MOT on ${when} recorded ${formatOdo(mot.miles)} miles. Is ${formatOdo(miles)} right?`,
      };
    }
    if (miles - mot.miles > 100_000) {
      return {
        kind: "confirm",
        title: "That's a lot more than your last MOT",
        body: `Your MOT on ${when} recorded ${formatOdo(mot.miles)} miles. Is ${formatOdo(miles)} right?`,
      };
    }
  }
  return { kind: "ok" };
}

export function lowerThanEarlierAlert(earlierMiles: number, earlierAt: Date) {
  return {
    title: "That's lower than an earlier reading",
    body: `You recorded ${formatOdo(earlierMiles)} on ${shortDate(earlierAt)}. Odometers don't go backwards. If the earlier reading was wrong, delete it first.`,
  };
}

/** Message under the vehicle's odometer card after a successful save. */
export function saveOutcomeMessage(estimateMiles: number | null, miles: number): string {
  if (estimateMiles == null) return "Saved. Your trips will be added from here.";
  const diff = miles - estimateMiles;
  if (Math.abs(diff) <= 1) return "Saved. That matches your trips.";
  const n = Math.round(Math.abs(diff));
  const word = milesWord(n);
  return diff > 0
    ? `Saved. That's ${n} ${word} more than your trips. Your log uses it from then on.`
    : `Saved. That's ${n} ${word} less than your trips. Your log uses it from then on.`;
}

/** Lowest allowed "When did you read it?": vehicle created minus 365 days. */
export function earliestReadAt(vehicleCreatedAt: string | null | undefined, now: Date): Date {
  const created = vehicleCreatedAt ? new Date(vehicleCreatedAt) : null;
  const base = created && !Number.isNaN(created.getTime()) ? created : now;
  return new Date(base.getTime() - 365 * 24 * 60 * 60 * 1000);
}

// ── Vehicle section text (SPEC-UX 1.1, 8) ────────────────────────────

export function figureText(current: OdometerCurrent): string {
  return `${formatOdo(current.miles)} miles`;
}

export function statusText(current: OdometerCurrent): "Estimated" | "Recorded" {
  return current.isEstimated ? "Estimated" : "Recorded";
}

/** The explanation under the big figure. */
export function basisText(current: OdometerCurrent): string {
  const at = new Date(current.basis.readAt);
  const trips = Math.round(current.tripMilesSince);
  const nothingSince = !current.isEstimated || trips < 1;
  const date = shortDate(at);
  const plus = `plus ${trips} ${milesWord(trips)} of trips since.`;
  switch (current.basis.source) {
    case "fuel":
      return nothingSince ? `From your fuel log on ${date}.` : `From your fuel log on ${date}, ${plus}`;
    case "trip":
      return nothingSince ? `From a trip on ${date}.` : `From a trip on ${date}, ${plus}`;
    default:
      return nothingSince
        ? `Your reading on ${shortDateTime(at)}.`
        : `Your reading of ${formatOdo(current.basis.readingMiles)} on ${date}, ${plus}`;
  }
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/** The "worth checking" line, or null when the latest reading is under 60 days old. */
export function oldReadingText(current: OdometerCurrent, now: Date = new Date()): string | null {
  const days = daysBetween(new Date(current.basis.readAt), now);
  if (!(days > 60)) return null;
  return `Last reading was ${days} days ago. Worth checking it against your dashboard.`;
}

export const PENDING_SYNC_TEXT = "Trips still on this phone are added once they sync.";

export function figureA11y(current: OdometerCurrent): string {
  return `Odometer, ${current.isEstimated ? "estimated" : "recorded"}, ${formatOdo(current.miles)} miles. ${basisText(current)}`;
}

/** Vehicles list card: "45,262 mi est." or "45,140 mi". */
export function vehicleCardMeta(odo: VehicleListOdometer | null | undefined): string | null {
  if (!odo || !Number.isFinite(odo.miles)) return null;
  return `${formatOdo(odo.miles)} mi${odo.isEstimated ? " est." : ""}`;
}

export function vehicleCardMetaA11y(odo: VehicleListOdometer | null | undefined): string | null {
  if (!odo || !Number.isFinite(odo.miles)) return null;
  return `odometer ${odo.isEstimated ? "estimated " : ""}${formatOdo(odo.miles)} miles`;
}

// ── Source labels for the readings list ──────────────────────────────

export function sourceLabel(source: OdometerReadingRow["source"]): string {
  switch (source) {
    case "trip": return "From a trip";
    case "fuel": return "From a fuel log";
    default: return "Typed in";
  }
}

// ── Trips tab day line (SPEC-UX 2.3) ─────────────────────────────────

/** True only when the day has a figure at both ends. */
export function dayHasFigures(day: OdometerDay): boolean {
  return day.opening != null && day.closing != null;
}

export function dayLineText(day: OdometerDay): string {
  const base = `Odometer ${formatOdo(day.opening ?? 0)} to ${formatOdo(day.closing ?? 0)}`;
  return day.openingRecorded && day.closingRecorded ? `${base} (recorded)` : `${base} est.`;
}

export function dayLineA11y(day: OdometerDay): string {
  const state = day.openingRecorded && day.closingRecorded ? "recorded" : "estimated";
  return `Odometer at the start of the day ${formatOdo(day.opening ?? 0)}, at the end ${formatOdo(day.closing ?? 0)}, ${state}. Opens the odometer log.`;
}

/**
 * Which Trips tab days get a line. A day gets one only when exactly one
 * vehicle drove that day and it has figures at both ends; days that are not
 * on screen are ignored. Returns a map keyed by "YYYY-MM-DD".
 */
export function selectDayLines(
  days: readonly OdometerDay[],
  visibleDayKeys: readonly string[]
): Map<string, OdometerDay> {
  const visible = new Set(visibleDayKeys);
  const byDate = new Map<string, OdometerDay[]>();
  for (const d of days) {
    if (!visible.has(d.date)) continue;
    const list = byDate.get(d.date);
    if (list) list.push(d);
    else byDate.set(d.date, [d]);
  }
  const out = new Map<string, OdometerDay>();
  for (const [date, list] of byDate) {
    if (list.length === 1 && dayHasFigures(list[0])) out.set(date, list[0]);
  }
  return out;
}

/** The loaded span of a Trips list as a request range, capped at 366 days. */
export function loadedRange(visibleDayKeys: readonly string[]): { from: string; to: string } | null {
  if (visibleDayKeys.length === 0) return null;
  const sorted = [...visibleDayKeys].sort();
  const to = sorted[sorted.length - 1];
  let from = sorted[0];
  const fromDate = parseDayKey(from);
  const toDate = parseDayKey(to);
  if (!fromDate || !toDate) return null;
  if (daysBetween(fromDate, toDate) > 365) {
    const clamped = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() - 365, 12);
    from = dayKeyOf(clamped);
  }
  return { from, to };
}

// ── Odometer log day cards (SPEC-UX 3.2) ─────────────────────────────

/** "+8 mi" / "-12 mi", or null when it rounds to nothing. */
export function signedMiles(diff: number): string | null {
  const n = Math.round(diff);
  if (n === 0) return null;
  return `${n > 0 ? "+" : "-"}${Math.abs(n)} mi`;
}

export function differenceLine(diff: number): string | null {
  const s = signedMiles(diff);
  return s ? `Readings differ from trips by ${s}` : null;
}

export function differenceAlert(diff: number): { title: string; body: string } {
  const n = Math.abs(Math.round(diff));
  const word = milesWord(n);
  return {
    title: "Why the difference?",
    body:
      diff > 0
        ? `Your odometer reading was ${n} ${word} more than your recorded trips. Usually a short drive that wasn't recorded, or GPS measuring a little differently to your car.`
        : `Your odometer reading was ${n} ${word} less than your recorded trips. Usually GPS measuring a little differently to your car.`,
  };
}

export function mileageRowParts(day: OdometerDay): string[] {
  const parts = [`Business ${formatDayMiles(day.businessMiles)} mi`, `Personal ${formatDayMiles(day.personalMiles)} mi`];
  if (Math.round(day.notSortedMiles * 10) > 0) parts.push(`Not sorted ${formatDayMiles(day.notSortedMiles)} mi`);
  return parts;
}

export function dayCardA11y(day: OdometerDay, date: Date): string {
  const fig = (v: number | null, rec: boolean) =>
    v == null ? "no reading yet" : `${formatOdo(v)}, ${rec ? "recorded" : "estimated"}`;
  const parts = [
    `${longDate(date)}.`,
    `Start ${fig(day.opening, day.openingRecorded)}.`,
    `End ${fig(day.closing, day.closingRecorded)}.`,
    `Business ${formatDayMiles(day.businessMiles)} miles, personal ${formatDayMiles(day.personalMiles)} miles`
      + (Math.round(day.notSortedMiles * 10) > 0 ? `, not sorted ${formatDayMiles(day.notSortedMiles)} miles.` : "."),
  ];
  const diff = differenceLine(day.difference);
  if (diff) parts.push(`${diff}.`);
  return parts.join(" ");
}

// ── Periods (SPEC-UX 3.4) ────────────────────────────────────────────

export type OdometerPeriod = "this_week" | "last_week" | "this_month" | "custom";

export const PERIOD_LABELS: Record<OdometerPeriod, string> = {
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  custom: "Choose dates",
};

export function isOdometerPeriod(v: unknown): v is OdometerPeriod {
  return v === "this_week" || v === "last_week" || v === "this_month" || v === "custom";
}

/** Monday of the week containing `d`, local, at noon. */
function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset, 12);
}

export function periodRange(
  period: Exclude<OdometerPeriod, "custom">,
  now: Date = new Date()
): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (period === "this_week") return { from: dayKeyOf(mondayOf(today)), to: dayKeyOf(today) };
  if (period === "last_week") {
    const mon = mondayOf(today);
    const lastMon = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 7, 12);
    const lastSun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 1, 12);
    return { from: dayKeyOf(lastMon), to: dayKeyOf(lastSun) };
  }
  return { from: dayKeyOf(new Date(today.getFullYear(), today.getMonth(), 1, 12)), to: dayKeyOf(today) };
}

/** Custom range: from before to, at most 366 days. Returns an error string or null. */
export function validateCustomRange(from: Date, to: Date): string | null {
  if (from.getTime() > to.getTime()) return "The start date is after the end date.";
  if (daysBetween(from, to) > 365) return "Pick a range of 366 days or fewer.";
  return null;
}

// ── Home prompt gate (SPEC-UX 1.4) ───────────────────────────────────

export interface PromptGateInput {
  isWork: boolean;
  vehicleCount: number;
  /** The default vehicle already has a figure of any kind. */
  defaultVehicleHasReading: boolean;
  completedTrips: number;
  dismissedOnDevice: boolean;
}

export function shouldShowOdometerPrompt(i: PromptGateInput): boolean {
  return (
    i.isWork &&
    i.vehicleCount >= 1 &&
    !i.defaultVehicleHasReading &&
    i.completedTrips >= 3 &&
    !i.dismissedOnDevice
  );
}

// ── MOT hint (SPEC-UX 5) ─────────────────────────────────────────────

export interface MotTestLike {
  completedDate: string;
  odometerValue: number | null;
  odometerUnit: string | null;
}

/**
 * The newest MOT test that recorded an odometer value, as a hint. Returns
 * null when there is none, or when its unit is not miles (kilometres are
 * never converted: no hint and no typo check).
 */
export function pickMotHint(tests: readonly MotTestLike[] | null | undefined): MotHint | null {
  if (!tests) return null;
  let best: { ms: number; t: MotTestLike } | null = null;
  for (const t of tests) {
    if (typeof t.odometerValue !== "number" || !(t.odometerValue > 0)) continue;
    const ms = new Date(t.completedDate).getTime();
    if (Number.isNaN(ms)) continue;
    if (!best || ms > best.ms) best = { ms, t };
  }
  if (!best) return null;
  const unit = (best.t.odometerUnit ?? "").toLowerCase();
  if (unit !== "mi" && unit !== "miles") return null;
  return { date: new Date(best.ms), miles: best.t.odometerValue as number };
}

export function motHintText(mot: MotHint): string {
  return `Your last MOT (${motDate(mot.date)}) recorded ${formatOdo(mot.miles)} miles.`;
}

// ── Errors ───────────────────────────────────────────────────────────

/** A failure to reach the server at all (offline, timeout, DNS). */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "TypeError") return true;
  return /network|REFRESH_NETWORK_ERROR|REFRESH_SECURESTORE_BLOCKED|timed? ?out/i.test(err.message);
}

// ── Digit cells (SPEC-VISUAL 1a) ─────────────────────────────────────

/**
 * Whole miles as groups of digit characters, thousands apart, no leading
 * zeros: 45262 -> [["4","5"],["2","6","2"]]. Tenths are never shown.
 */
export function digitGroups(miles: number): string[][] {
  const n = Math.max(0, Math.round(miles));
  const s = String(n);
  const groups: string[][] = [];
  for (let end = s.length; end > 0; end -= 3) {
    groups.unshift(s.slice(Math.max(0, end - 3), end).split(""));
  }
  return groups;
}

/** More than seven digits falls back to the compact figure. */
export function fitsDigitCells(miles: number): boolean {
  return String(Math.max(0, Math.round(miles))).length <= 7;
}

// ── Split bar (SPEC-VISUAL 5b) ───────────────────────────────────────

/** Shares (0 to 1) of a day's miles, for the thin split bar. */
export function splitShares(day: Pick<OdometerDay, "businessMiles" | "personalMiles" | "notSortedMiles">) {
  const total = day.businessMiles + day.personalMiles + day.notSortedMiles;
  if (!(total > 0)) return { business: 0, personal: 0, notSorted: 0 };
  return {
    business: day.businessMiles / total,
    personal: day.personalMiles / total,
    notSorted: day.notSortedMiles / total,
  };
}

// ── Live hint under the sheet input (SPEC-VISUAL 3) ──────────────────

export type LiveHintTone = "none" | "close" | "info" | "error" | "warn";

export interface LiveHint {
  tone: LiveHintTone;
  message: string | null;
}

export function liveHint(input: {
  text: string;
  estimateMiles: number | null;
  /** The latest accepted reading at or before the chosen time. */
  earlier: { readingMiles: number; readAt: string } | null;
}): LiveHint {
  const parsed = parseReadingInput(input.text);
  if (parsed.kind !== "ok") return { tone: "none", message: null };
  const miles = parsed.miles;
  if (input.earlier && miles < input.earlier.readingMiles) {
    return {
      tone: "error",
      message: `Lower than your reading of ${formatOdo(input.earlier.readingMiles)} on ${shortDate(new Date(input.earlier.readAt))}. Check the number.`,
    };
  }
  if (input.estimateMiles == null) return { tone: "none", message: null };
  const diff = miles - input.estimateMiles;
  if (diff > 1000) {
    return {
      tone: "warn",
      message: `That's ${formatOdo(diff)} mi more than we estimated. Is that right?`,
    };
  }
  if (Math.abs(diff) <= 25) return { tone: "close", message: "Close to our estimate" };
  const n = formatOdo(Math.abs(diff));
  return diff > 0
    ? { tone: "info", message: `${n} mi more than we estimated. Trips without the app make up the difference.` }
    : { tone: "info", message: `${n} mi less than we estimated.` };
}

export function chipA11y(recorded: boolean): string {
  return recorded ? "recorded" : "estimated";
}

// ── 409 classification (LOWER_THAN_EARLIER / HIGHER_THAN_LATER) ──────

export type ReadingConflict =
  | { kind: "lower"; otherMiles: number; otherAt: Date }
  | { kind: "higher"; otherMiles: number; otherAt: Date };

/**
 * apiRequest drops the 409 body, so work out which rule refused the reading
 * from a fresh readings list. Lower: an accepted reading at or before the
 * chosen time is higher than the entry. Higher: an accepted typed reading
 * after the chosen time is lower than the entry (the nearest one is named).
 */
export function classifyConflict(
  readings: readonly OdometerReadingRow[],
  miles: number,
  readAt: Date
): ReadingConflict | null {
  const earlier = latestAcceptedBefore(readings, readAt);
  if (earlier && earlier.readingMiles > miles) {
    return { kind: "lower", otherMiles: earlier.readingMiles, otherAt: new Date(earlier.readAt) };
  }
  let later: OdometerReadingRow | null = null;
  let laterMs = Infinity;
  for (const r of readings) {
    if (!r.used || r.source !== "user") continue;
    const ms = new Date(r.readAt).getTime();
    if (Number.isNaN(ms) || ms <= readAt.getTime() || r.readingMiles >= miles) continue;
    if (ms < laterMs) {
      later = r;
      laterMs = ms;
    }
  }
  if (later) return { kind: "higher", otherMiles: later.readingMiles, otherAt: new Date(later.readAt) };
  return null;
}

export function higherThanLaterAlert(laterMiles: number, laterAt: Date) {
  return {
    title: "That's higher than a later reading",
    body: `That's higher than your reading of ${formatOdo(laterMiles)} on ${shortDate(laterAt)}, which was taken later. Check the reading or the time.`,
  };
}
