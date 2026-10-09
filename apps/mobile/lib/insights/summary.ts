// Words and figures for the Insights summary card. Pure, so the templates
// and the Pro-only comparison rule are tested without a phone.
//
// Comparison with the previous period is Pro only (Anthony, decision A,
// 9 Oct 2026). Callers pass `showComparison: false` for free drivers and the
// output then carries no comparison clause and no arrows.

import { periodNoun, previousWord, type InsightsPeriod } from "./period";

export function formatMilesShort(miles: number): string {
  if (miles < 100) {
    const r = Math.round(miles * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  return Math.round(miles).toLocaleString("en-GB");
}

export function milesWord(miles: number): string {
  return Math.round(miles * 10) / 10 === 1 ? "mile" : "miles";
}

export function tripsWord(trips: number): string {
  return trips === 1 ? "trip" : "trips";
}

/** "this week", "last week", "that week" */
export function whenPhrase(period: InsightsPeriod, offset: number): string {
  const noun = periodNoun(period);
  if (offset === 0) return `this ${noun}`;
  if (offset === -1) return `last ${noun}`;
  return `that ${noun}`;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The recap's busiest day label looks like "Monday 6 Oct"; keep the weekday. */
export function weekdayFrom(label: string | null | undefined): string | null {
  if (!label) return null;
  const hit = WEEKDAYS.find((d) => label.startsWith(d));
  return hit ?? null;
}

export interface SummaryInput {
  period: InsightsPeriod;
  offset: number;
  miles: number;
  trips: number;
  /** Previous period totals; null when unknown. */
  prevMiles: number | null;
  /** Pro only. When false the sentence never mentions the previous period. */
  showComparison: boolean;
  /** Total trips the driver has ever recorded. */
  tripsEver: number;
  busiestDay?: string | null;
  busiestDayMiles?: number;
}

export type SummaryKind = "empty" | "quiet" | "first" | "up" | "down" | "same" | "plain";

export interface SummarySentence {
  kind: SummaryKind;
  text: string;
}

/** Below this the two periods read as "about the same". */
function isSame(miles: number, prev: number): boolean {
  return Math.abs(miles - prev) < Math.max(1, prev * 0.05);
}

export function buildSummarySentence(i: SummaryInput): SummarySentence {
  const when = whenPhrase(i.period, i.offset);
  const noun = periodNoun(i.period);

  if (i.tripsEver === 0) {
    return { kind: "empty", text: "Your insights start with your first trip." };
  }

  if (i.trips === 0 || i.miles < 0.05) {
    const tail =
      i.showComparison && i.prevMiles && i.prevMiles >= 0.5
        ? ` ${capitalise(previousWord(i.period))}: ${formatMilesShort(i.prevMiles)} ${milesWord(i.prevMiles)}.`
        : "";
    const lead = i.offset === 0 ? `No trips ${when} yet.` : `No trips ${when}.`;
    return { kind: "quiet", text: `${lead}${tail}` };
  }

  const m = `${formatMilesShort(i.miles)} ${milesWord(i.miles)}`;
  const t = `${i.trips} ${tripsWord(i.trips)}`;
  const busiest = busiestClause(i);

  if (i.tripsEver < 10 && i.period === "week" && i.offset === 0) {
    return { kind: "first", text: `Your first week with MileClear: ${t}, ${m}.` };
  }

  if (i.showComparison && i.prevMiles !== null && i.prevMiles >= 0.5 && i.period !== "tax_year") {
    const diff = i.miles - i.prevMiles;
    const prev = previousWord(i.period);
    if (isSame(i.miles, i.prevMiles)) {
      return { kind: "same", text: `About the same as ${prev}: ${m}.${busiest}` };
    }
    const d = `${formatMilesShort(Math.abs(diff))} ${milesWord(Math.abs(diff))}`;
    if (diff > 0) {
      return {
        kind: "up",
        text: `Busy ${noun}: ${m} over ${t}, ${d} more than ${prev}.${busiest}`,
      };
    }
    return { kind: "down", text: `Quieter ${noun}: ${m}, ${d} fewer than ${prev}.${busiest}` };
  }

  return { kind: "plain", text: `${m} over ${t} ${when}.${busiest}` };
}

function busiestClause(i: SummaryInput): string {
  if (i.period !== "week" || i.trips < 2) return "";
  const day = weekdayFrom(i.busiestDay ?? null);
  if (!day || !i.busiestDayMiles || i.busiestDayMiles <= i.miles / 2) return "";
  return ` ${day} did most of it.`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Figures under the sentence ─────────────────────────────────────

export interface Figure {
  key: string;
  value: string;
  label: string;
  /** Neutral arrow for a change; grey, never red or green. */
  arrow?: "up" | "down";
  /** Spoken form. */
  spoken: string;
}

export interface FigureInput {
  mode: "work" | "personal";
  period: InsightsPeriod;
  miles: number;
  trips: number;
  prevMiles: number | null;
  showComparison: boolean;
  /** Mileage claim for the period in pence (Work); null when not known. */
  claimPence: number | null;
  formatPence: (pence: number) => string;
}

/** Up to three figures. Zero values are dropped, never shown as 0. */
export function buildFigures(i: FigureInput): Figure[] {
  const out: Figure[] = [];
  if (i.trips > 0) {
    out.push({
      key: "trips",
      value: String(i.trips),
      label: tripsWord(i.trips),
      spoken: `${i.trips} ${tripsWord(i.trips)}`,
    });
  }

  if (i.trips > 0 && i.showComparison && i.prevMiles !== null && i.prevMiles >= 0.5 && i.period !== "tax_year") {
    const diff = i.miles - i.prevMiles;
    if (Math.abs(diff) >= 0.5 && !isSame(i.miles, i.prevMiles)) {
      const abs = formatMilesShort(Math.abs(diff));
      out.push({
        key: "compare",
        value: `${abs} mi`,
        label: `vs ${previousWord(i.period)}`,
        arrow: diff > 0 ? "up" : "down",
        spoken: `${abs} ${milesWord(Math.abs(diff))} ${diff > 0 ? "more" : "fewer"} than ${previousWord(i.period)}`,
      });
    }
  }

  if (i.mode === "work") {
    if (i.claimPence !== null && i.claimPence > 0) {
      const v = i.formatPence(i.claimPence);
      out.push({ key: "claim", value: v, label: "claim built", spoken: `${v} mileage claim built` });
    }
  } else if (i.trips > 0 && i.miles > 0) {
    const avg = i.miles / i.trips;
    out.push({
      key: "avg",
      value: `${formatMilesShort(avg)} mi`,
      label: "average trip",
      spoken: `${formatMilesShort(avg)} ${milesWord(avg)} an average trip`,
    });
  }
  return out.slice(0, 3);
}

/** "Compare with last week with Pro" for the quiet upsell line. */
export function compareUpsellText(period: InsightsPeriod): string {
  return period === "tax_year" ? "" : `Compare with ${previousWord(period)} with Pro`;
}
