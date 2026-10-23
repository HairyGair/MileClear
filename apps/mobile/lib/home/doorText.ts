// The one sentence each Home door row says (PROPOSALS 0.6). Pure builders; the
// numbers come from the same endpoints the screens behind the doors use, so a
// door can never say something its screen contradicts.

import { distanceIn, formatPence, type DistanceUnit } from "@mileclear/shared";
import { milesFigure } from "./hero";
import type { HomePersona } from "./persona";

export interface WeekRecapLike {
  totalMiles: number;
  businessMiles: number;
  totalTrips: number;
  deductionPence: number;
  earningsPence?: number;
  longestTripMiles: number;
  longestTripDate: string | null;
  change?: { totalMilesPercent: number | null } | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function tripsWord(n: number): string {
  return n === 1 ? "trip" : "trips";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function milesWord(n: number): string {
  return round1(n) === 1 ? "mile" : "miles";
}

/** Driving distance in the driver's unit: "182 miles" / "293 km". A claim is never this. */
function driveText(miles: number, unit: DistanceUnit, short = false): string {
  if (unit === "km") return `${milesFigure(distanceIn(miles, unit))} km`;
  return `${milesFigure(miles)} ${short ? "mi" : milesWord(miles)}`;
}

/** "up 12%" / "down 8%" for a Pro driver; null when free, unknown or flat. */
export function changePhrase(percent: number | null | undefined, isPro: boolean): string | null {
  if (!isPro || percent == null || !Number.isFinite(percent)) return null;
  const p = Math.round(Math.abs(percent));
  if (p < 1) return null;
  return `${percent > 0 ? "up" : "down"} ${p}%`;
}

/**
 * The Insights door.
 *  - Work: "This week: 5 trips, £58 claim built" (Pro adds "up 12% on last week").
 *  - Personal: "This week: 182 miles, longest 41 mi on Monday".
 *  - Sunday evening to Monday noon: "Last week: 182 mi, £58 claim. See your week".
 * Returns null for a driver with no trips at all (nothing to say yet).
 */
export function insightsDoorText(args: {
  mode: "work" | "personal";
  persona: HomePersona;
  endOfWeek: boolean;
  /** Recap for the week that just ended; only read in the end-of-week window. */
  lastWeek: WeekRecapLike | null;
  thisWeek: WeekRecapLike | null;
  isPro: boolean;
  totalTrips: number;
  /** Distances in Settings. Default miles. */
  unit?: DistanceUnit;
}): string | null {
  const { mode, persona, thisWeek, lastWeek, isPro } = args;
  const unit = args.unit ?? "miles";
  if (args.totalTrips === 0) return null;
  const claimDriver = mode === "work" && persona !== "company" && persona !== "personal";

  if (args.endOfWeek && lastWeek && lastWeek.totalTrips > 0) {
    const bits = [driveText(lastWeek.totalMiles, unit, true)];
    if (claimDriver && lastWeek.deductionPence > 0) bits.push(`${formatPence(lastWeek.deductionPence)} claim`);
    return `Last week: ${bits.join(", ")}. See your week`;
  }

  if (!thisWeek) return null;

  if (thisWeek.totalTrips === 0) {
    return mode === "work" ? "Your miles and claim, week by week" : "Your driving, week by week";
  }

  if (mode === "personal") {
    const longest = round1(thisWeek.longestTripMiles);
    let day = "";
    if (thisWeek.longestTripDate) {
      const d = new Date(thisWeek.longestTripDate);
      if (!Number.isNaN(d.getTime())) day = ` on ${WEEKDAYS[d.getDay()]}`;
    }
    const miles = driveText(thisWeek.totalMiles, unit);
    return longest > 0 && thisWeek.totalTrips > 1
      ? `This week: ${miles}, longest ${driveText(longest, unit, true)}${day}`
      : `This week: ${miles}, ${thisWeek.totalTrips} ${tripsWord(thisWeek.totalTrips)}`;
  }

  const trips = `${thisWeek.totalTrips} ${tripsWord(thisWeek.totalTrips)}`;
  let text: string;
  if (claimDriver && thisWeek.deductionPence > 0) {
    text = `This week: ${trips}, ${formatPence(thisWeek.deductionPence)} claim built`;
  } else {
    text = `This week: ${trips}, ${driveText(thisWeek.totalMiles, unit)}`;
  }
  const change = changePhrase(thisWeek.change?.totalMilesPercent, isPro);
  return change ? `${text}, ${change} on last week` : text;
}

/**
 * The one key figure in a door sentence, drawn bold on Home (SPEC-VISUAL 5.6):
 * the first amount of money, else the first number with its unit ("113 days",
 * "22 miles", "139.9p"). Null when the sentence has neither.
 */
export function doorKeyFigure(text: string): { before: string; figure: string; after: string } | null {
  const m =
    /£[\d,]+(?:\.\d+)?/.exec(text) ??
    /\b\d[\d,]*(?:\.\d+)?(?:p\b|\s(?:days?|miles?|mi|km|trips?)\b)/.exec(text);
  if (!m) return null;
  return { before: text.slice(0, m.index), figure: m[0], after: text.slice(m.index + m[0].length) };
}

/** "£412 earned this week · £1.20 a mile"; null when nothing was earned. */
export function earningsDoorText(week: WeekRecapLike | null): string | null {
  if (!week) return null;
  const earned = week.earningsPence ?? 0;
  if (earned <= 0) return null;
  const base = `${formatPence(earned)} earned this week`;
  if (week.businessMiles >= 1) {
    const perMile = Math.round(earned / week.businessMiles);
    return `${base} · ${formatPence(perMile)} a mile`;
  }
  return base;
}

/**
 * The Invoices door: "2 unpaid · £433.50", or "All paid" when nothing is
 * waiting. Unpaid means sent or overdue (not paid, not written off). Null when
 * the figures are not known.
 */
export function invoicesDoorText(
  summary: Partial<Record<"sent" | "overdue", { count: number; totalPence: number }>> | null | undefined
): string | null {
  if (!summary) return null;
  const count = (summary.sent?.count ?? 0) + (summary.overdue?.count ?? 0);
  const pence = (summary.sent?.totalPence ?? 0) + (summary.overdue?.totalPence ?? 0);
  if (count <= 0) return "All paid";
  return `${count} unpaid · ${formatPence(pence)}`;
}

/** "Next badge: Explorer, 22 mi to go". */
export function badgesDoorText(next: { label: string; progressText: string } | null): string | null {
  if (!next) return null;
  return `Next badge: ${next.label}, ${next.progressText}`;
}

/** "Diesel 139.9p at Tesco Silksworth, 1.2 mi". Null for EV drivers or no data. */
export function fuelDoorText(
  data: { kind: string; fuel?: string; stationName?: string; pencePerLitre?: number; distanceMiles?: number } | null,
  unit: DistanceUnit = "miles"
): string | null {
  if (!data || data.kind !== "fuel") return null;
  if (!data.stationName || typeof data.pencePerLitre !== "number") return null;
  const fuel = data.fuel === "diesel" ? "Diesel" : "Petrol";
  const p = Math.round(data.pencePerLitre * 10) / 10;
  const dist =
    typeof data.distanceMiles === "number"
      ? `, ${round1(distanceIn(data.distanceMiles, unit)).toFixed(1)} ${unit === "km" ? "km" : "mi"}`
      : "";
  return `${fuel} ${p}p at ${data.stationName}${dist}`;
}

/** The Tax door in the January season: "Ready for 31 January? 2 things to sort · 52 days". */
export function saSeasonText(args: {
  attentionCount: number;
  daysToDeadline: number;
}): string | null {
  if (args.daysToDeadline < 0) return null;
  const days = `${args.daysToDeadline} ${args.daysToDeadline === 1 ? "day" : "days"}`;
  if (args.attentionCount > 0) {
    return `Ready for 31 January? ${args.attentionCount} ${args.attentionCount === 1 ? "thing" : "things"} to sort · ${days}`;
  }
  return `Ready for 31 January? Nothing left to sort · ${days}`;
}
